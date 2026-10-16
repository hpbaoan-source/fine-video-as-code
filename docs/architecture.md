# Architecture

## High-level data flow

```
[User] → web/index.html
            │ (1) submit form
            ▼
       Fastify API (POST /api/generate)
            │ (2) jobId + 202 Accepted
            ▼
       In-memory job queue (concurrency=1)
            │
            ├─► (3a) Step 1: Scripting
            │      form data + LLM rewrite → script.json
            │      (LLM key auto-read from ~/.nanobot/config.json;
            │       if no key, template-only is used;
            │       if `presetScript` field, loaded directly from file)
            │
            ├─► (3b) Step 2: TTS
            │      Python edge-tts per scene → audio/*.mp3
            │      measure actual duration (ffprobe or header parse)
            │      → durations.json
            │
            ├─► (3c) Step 3: Asset generation
            │      satori + resvg → assets/*.png  (optional, no-op)
            │
            └─► (3d) Step 4: Render
                   Playwright + headless Chromium opens the template HTML
                   (1920×1080), records the page activity to webm,
                   ffmpeg-static: webm → mp4 (no audio),
                   then muxes with concatenated TTS audio → final MP4
            │
            ▼
       SSE stream (real-time progress) → web UI
            │
            ▼
       Download link (GET /api/download/:jobId)
```

## Why Playwright + HTML/CSS (not Remotion)

Earlier versions used [Remotion](https://www.remotion.pro). Remotion is free for individuals, but its **"Remotion for Automators"** tier charges **$100/month minimum** for any prompt-to-video app — which is exactly what this project is. That makes a free public MIT repo untenable.

We switched to **Playwright + headless Chromium + ffmpeg-static**:

| | Remotion (old) | Playwright (new) |
|---|---|---|
| License | Free ≤3 người; "Automators" $100/mo | Apache 2.0 — MIT-clean |
| Ngôn ngữ | JSX/React | HTML/CSS/JS |
| Render engine | Chromium bundle via Vite (~2 min first run) | Playwright + Chromium (~3 min first run) |
| Audio sync | `<Audio src>` in JSX | ffmpeg-static mux after recording |
| Time model | Frame-based | CSS transition + JS scheduler |
| Export MP4 | `renderMedia()` | `page.video()` + ffmpeg |
| Per-render cost | $0.01 (Automators tier) | $0 |

The HTML templates are simple enough to be edited in any editor. See `backend/templates/*.html` for the three built-in styles.

## Tech stack

| Layer | Tech | License | Why |
|---|---|---|---|
| Frontend | Vanilla HTML + JS + Tailwind CDN | MIT | Simple, no build step |
| Backend | Node.js + Fastify | MIT | Async-native, fast, schema validation |
| Video render | Playwright + headless Chromium | Apache 2.0 | MIT-clean, no $100/mo Automators tier |
| TTS | Python `edge-tts` | MIT | Multi-language, no API key needed |
| Audio mux | ffmpeg-static | LGPL | Bundled binary, no system install needed |
| Validation | Zod | MIT | Type-safe input parsing |
| Real-time | Server-Sent Events (SSE) | — | Simpler than WebSocket, one-way push |

## Components

### Backend layout

```
backend/
├── server.js              # Fastify entry, port 3000
├── routes/
│   ├── generate.js        # POST /api/generate, GET /api/voices
│   ├── status.js          # GET /api/status/:jobId (SSE), /snapshot
│   └── download.js        # GET /api/download/:jobId, /api/jobs
├── lib/
│   ├── schema.js          # Zod input/output schemas
│   ├── job-store.js       # In-memory job state + per-job EventEmitter
│   ├── job-queue.js       # Single-process serial executor
│   └── llm-client.js      # Provider-agnostic LLM wrapper
├── workflow/
│   ├── index.js           # Orchestrator — runs 4 steps in sequence
│   ├── step1-script.js    # Template + LLM rewrite + presetScript support
│   ├── step2-tts.js       # Python edge-tts + duration measurement
│   ├── step3-assets.js    # Satori → PNG (optional, no-op)
│   └── step4-render.js    # Playwright + ffmpeg-static
└── templates/             # HTML templates for Playwright
    ├── tech-explainer.html
    ├── promo.html
    ├── tutorial.html
    └── README.md
```

### Frontend layout

```
web/
├── index.html             # Single-page form + progress + result
├── css/style.css          # Custom CSS over Tailwind CDN
├── js/app.js              # Form submit + EventSource + UI state machine
└── assets/
    └── favicon.svg
```

## Per-template HTML structure

Each `backend/templates/<name>.html` is a self-contained file with:

1. CSS for the visual style (dark editorial / high-energy / step cards)
2. An inline JS scheduler that:
   - Reads `data.json` from `?_data/data.json`
   - Pre-builds scene elements (display:none)
   - Schedules each scene's intro/hold/outro at the right time
   - Sets `window.__renderDone = true` when finished

The backend writes `data.json` per-job to the workdir, starts a local HTTP server serving both the template dir and the workdir (via `/_data/` prefix), and opens the template URL in Playwright.

## Deployment

**Local self-hosted** (recommended for MVP):

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install
npx playwright install chromium
pip install edge-tts
npm start
# → http://localhost:3000
```

Each user runs their own instance. Pre-rendered sample videos in `samples/` show what the system produces — no installation required to evaluate the output.

## Why these choices

- **Fastify over Express**: better async handling, built-in JSON schema, ~2x faster.
- **Playwright over Puppeteer**: better API, more reliable, headless Chromium baked in.
- **HTML templates over canvas drawing**: easy to author, easy to read, easy to modify. No need to learn Motion Canvas or Remotion DSL.
- **Python edge-tts over npm wrapper**: the npm wrapper has a hardcoded token that Microsoft rotates. The Python `edge-tts` package fetches a fresh token per request.
- **SSE over WebSocket**: progress is one-way and rarely needs to be reconnected. SSE is much simpler to serve and proxy.
- **In-memory queue**: MVP-scale, no DB needed. Swap to BullMQ + Redis when the queue needs to survive restarts or scale beyond one process.

## API contract

See [`api.md`](api.md) for the full REST + SSE spec.
