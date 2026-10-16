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
            │       if no key, template-only is used)
            │
            ├─► (3b) Step 2: TTS
            │      Python edge-tts per scene → audio/*.mp3
            │      measure actual duration (ffprobe or header parse)
            │      → durations.json
            │
            ├─► (3c) Step 3: Asset generation
            │      satori + resvg → assets/*.png
            │      (no-op if satori not installed; templates
            │       don't depend on these PNGs)
            │
            └─► (3d) Step 4: Render
                   Remotion programmatic API bundles + renders
                   → <outputFilename>.mp4
            │
            ▼
       SSE stream (real-time progress) → web UI
            │
            ▼
       Download link (GET /api/download/:jobId)
```

## Tech stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Vanilla HTML + JS + Tailwind CDN | Simple, no build step |
| Backend | Node.js + Fastify | Async-native, fast, schema validation |
| Video engine | Remotion (programmatic) | React-based, frame-perfect timing |
| TTS | Python `edge-tts` (free MS Edge voices) | Multi-language, no API key needed |
| Asset gen | Satori + @resvg/resvg-js | SVG → PNG for charts/icons |
| Validation | Zod | Type-safe input parsing |
| Real-time | Server-Sent Events (SSE) | Simpler than WebSocket, one-way push |
| Process | execFile (Node) | Promise-based subprocess |

## Components

### Backend layout

```
backend/
├── server.js          # Fastify entry, port 3000
├── routes/
│   ├── generate.js    # POST /api/generate, GET /api/voices
│   ├── status.js      # GET /api/status/:jobId (SSE), /snapshot
│   └── download.js    # GET /api/download/:jobId, /api/jobs
├── lib/
│   ├── schema.js      # Zod input/output schemas
│   ├── job-store.js   # In-memory job state + per-job EventEmitter
│   ├── job-queue.js   # Single-process serial executor
│   └── llm-client.js  # Provider-agnostic LLM wrapper (reads ~/.nanobot/config.json)
├── workflow/
│   ├── index.js       # Orchestrator — runs 4 steps in sequence
│   ├── step1-script.js  # Template + LLM rewrite
│   ├── step2-tts.js     # Python edge-tts
│   ├── step3-assets.js  # Satori → PNG (optional)
│   └── step4-render.js  # Remotion programmatic
└── templates/         # 3 Remotion compositions + _entry.jsx
    ├── _entry.jsx     # registerRoot() entry
    ├── tech-explainer.jsx
    ├── promo.jsx
    └── tutorial.jsx
```

### Frontend layout

```
web/
├── index.html         # Single-page form + progress + result
├── css/style.css      # Custom CSS over Tailwind CDN
├── js/app.js          # Form submit + EventSource + UI state machine
└── assets/
    └── favicon.svg
```

## Deployment

**Local self-hosted** (recommended for MVP):

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install
npm start
# → http://localhost:3000
```

Each user runs their own instance. Pre-rendered sample videos in `samples/` show what the system produces — no installation required to evaluate the output.

## Why these choices

- **Fastify over Express**: better async handling, built-in JSON schema, ~2x faster.
- **Remotion over ffmpeg-from-scratch**: React + JSX is dramatically easier to author and maintain than filter graphs; Remotion's programmatic API lets us bundle dynamic compositions at render time.
- **Python edge-tts over npm wrapper**: the npm wrapper has a hardcoded token that Microsoft rotates. The Python `edge-tts` package fetches a fresh token per request.
- **SSE over WebSocket**: progress is one-way and rarely needs to be reconnected. SSE is much simpler to serve and proxy.
- **In-memory queue**: MVP-scale, no DB needed. Swap to BullMQ + Redis when the queue needs to survive restarts or scale beyond one process.

## API contract

See [`api.md`](api.md) for the full REST + SSE spec.
