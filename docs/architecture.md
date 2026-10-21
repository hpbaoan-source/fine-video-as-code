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
            ├─► Step 1: Scripting
            │      form data + LLM rewrite → script.json
            │      (LLM_API_KEY env var; if missing, template-only is used;
            │       if `presetScript` field, loaded directly from file)
            │      normalised: template alias → canonical name, content
            │      budgets applied, layout variant picked per scene
            │
            ├─► Step 2: TTS
            │      Python edge-tts per scene → audio/scene-N.mp3
            │      measure actual duration with ffmpeg -f null -
            │      overwrite scene.duration_ms with the measured length
            │      pad each MP3 to scene.duration_ms with ffmpeg `apad`
            │      (silence fallback via `anullsrc` if TTS fails)
            │
            └─► Step 4: Render
                   Playwright + headless Chromium opens the template HTML
                   (1920×1080), data.json mounted under /_data/
                   ├─ deterministic (default): drive page via window.__seek,
                   │   screenshot each frame, ffmpeg PNG stream → MP4
                   └─ realtime (DETERMINISTIC_RENDER=0): recordVideo → webm
                       → MP4, reads window.__t0_offset_ms for audio align
                   concat audio with `apad` padding (not `-c copy`)
                   mux with -itsoffset t0 so audio lines up with first frame
            │
            ▼
       SSE stream (real-time progress) → web UI
            │
            ▼
       Download link (GET /api/download/:jobId)
```

## The rendering stack

The renderer is **Playwright + headless Chromium + vanilla HTML/CSS templates + Edge-TTS + ffmpeg-static**.

| Piece                 | Licence                  | Why it is here                                                                      |
| --------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| Playwright + Chromium | Apache 2.0               | MIT-compatible, one `npm run setup` to install, no bundler in the way.              |
| HTML templates        | MIT                      | A template is a 1920×1080 HTML file — editable in any editor, by a human or an LLM. |
| `_engine.js`          | MIT                      | One shared engine (brand vars, `__seek`, visual cues) behind all three templates.   |
| Edge-TTS (Python CLI) | MIT                      | Free Microsoft Edge voices, no API key, multi-language.                             |
| ffmpeg-static         | LGPL (open-source build) | The bundled binary muxes the audio and writes the MP4 — no system ffmpeg needed.    |

Consequences of this choice:

- **One permissive licence for the whole repo.** No per-seat or per-render licence fees, so the project can stay public and MIT.
- **No build step.** Editing a template and re-rendering is a save + `npm run render-sample` away.
- **Fast and reproducible.** The deterministic path screenshots one frame at a time and pipes the PNGs into ffmpeg — the output is a pure function of `(template, data.json, fps)`.

See `backend/templates/_engine.js` for the shared engine and `backend/templates/*.html` for the three built-in styles.

## Tech stack

| Layer        | Tech                             | License    | Why                                      |
| ------------ | -------------------------------- | ---------- | ---------------------------------------- |
| Frontend     | Vanilla HTML + JS + Tailwind CDN | MIT        | Simple, no build step                    |
| Backend      | Node.js + Fastify                | MIT        | Async-native, fast, schema validation    |
| Video render | Playwright + headless Chromium   | Apache 2.0 | MIT-clean, no licence tiers, no bundler  |
| TTS          | Python `edge-tts`                | MIT        | Multi-language, no API key needed        |
| Audio mux    | ffmpeg-static                    | LGPL       | Bundled binary, no system install needed |
| Validation   | Zod                              | MIT        | Type-safe input parsing                  |
| Real-time    | Server-Sent Events (SSE)         | —          | Simpler than WebSocket, one-way push     |

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
│   ├── schema.js          # Zod input/output schemas (outputFilename, voice enum, etc.)
│   ├── design-system.js   # Template aliases + content budgets + layout picking
│   ├── text.js            # Pure text helpers (truncate, squish, duration estimate)
│   ├── job-store.js       # In-memory job state + per-job EventEmitter
│   ├── job-queue.js       # Single-process serial executor
│   ├── path-guard.js      # isPathInside() — blocks path-traversal in presetScript
│   ├── cleanup.js         # Removes expired job workdirs
│   └── llm-client.js      # Provider-agnostic LLM wrapper (env-only config)
├── workflow/
│   ├── index.js           # Orchestrator — runs 3 steps in sequence
│   ├── step1-script.js    # Template + LLM rewrite + presetScript support
│   ├── step2-tts.js       # Python edge-tts + actual-length measurement + apad
│   └── step4-render.js    # Playwright (deterministic + realtime) + ffmpeg-static
├── templates/             # HTML templates + shared engine for Playwright
│   ├── _engine.js         # window.fineVideoEngine — brand CSS vars, __seek, visual_cues
│   ├── tech-explainer.html
│   ├── promo.html
│   ├── tutorial.html
│   └── README.md
└── tests/                 # node --test, no extra deps
    ├── schema.test.js
    ├── path-guard.test.js
    ├── ffmpeg-args.test.js
    ├── duration.test.js
    ├── determinism.test.js
    ├── sync.test.js
    ├── cleanup.test.js
    └── env.test.js
```

### Frontend layout

```
web/
├── index.html             # Single-page form + progress + result
├── css/style.css          # Custom CSS over Tailwind CDN
├── js/app.js              # Form submit + EventSource + UI state machine
└── assets/
    ├── favicon.svg
    └── README.md
```

### Shared design tokens

```
shared/
└── design-tokens.css      # Colour / spacing / radius / type / motion tokens
```

The token file is the single source of truth for colour, spacing, radius, typography
and motion. It is consumed by both the video templates (rendered by Playwright) and
the web portal (served by Fastify), so a token change lands everywhere at once.
`--fv-brand` / `--fv-accent` stay overridable per render.

## Per-template HTML structure

Each `backend/templates/<name>.html` is a self-contained file with:

1. CSS for the visual style (dark editorial / high-energy / step cards)
2. A `<style>` block reading brand colors via CSS custom properties (`var(--brand)`, `var(--accent)`) — injected from `data.brand` by `_engine.js`
3. A `<script>` block that imports `_engine.js` via `<script src="_engine.js"></script>` and calls `window.fineVideoEngine.init({ data, totalMs })` to wire up:
   - `window.__seek(tMs)` — used by the deterministic renderer to drive the page's internal clock to a specific time
   - `window.__duration()` — returns total scene length for the renderer to compute frame distribution
   - `window.__t0_offset_ms` — set by the realtime path so the backend can align audio
   - `window.__renderDone` — set when the realtime animation finishes
4. Template-specific scene layouts (heading + voiceover + optional `visual_cues` like `chart` or `code`)

The backend writes `data.json` per-job to the workdir, starts a local HTTP server serving both the template dir and the workdir (via `/_data/` prefix), and opens the template URL in Playwright. See `backend/templates/README.md` for the engine API.

## Render paths: deterministic vs realtime

The renderer picks one of two paths based on `input.deterministic` (default `true`) or the `DETERMINISTIC_RENDER` env var.

|                  | Deterministic (default)                       | Realtime                                         |
| ---------------- | --------------------------------------------- | ------------------------------------------------ |
| Driver           | `page.evaluate(window.__seek, tMs)` per frame | Page's own `setInterval` scheduler               |
| Output           | PNG sequence → ffmpeg `image2` → MP4          | `recordVideo` webm → ffmpeg → MP4                |
| Reproducible     | Yes (same input → same MP4)                   | No (webm encoding is non-deterministic)          |
| Speed (slow CPU) | ~0.5× realtime                                | ~1.5–2.5× realtime                               |
| Audio alignment  | Not needed (PNGs are exactly positioned)      | `ffmpeg -itsoffset` with `window.__t0_offset_ms` |
| First-frame wait | None                                          | 0–500ms (page load + first paint)                |

Deterministic mode is the default because it makes video output comparable across runs (useful for tests, cache invalidation, and reproducible demos). Realtime mode exists for users on weak hardware where `page.screenshot` × 2850 frames is too slow.

## `data.json` shape

What the backend writes into the workdir, and what each template's `data.json` fetch reads:

```jsonc
{
  "topic": "How HTTPS Works", // for header
  "scenes": [
    {
      "id": "scene-1", // unique within scenes[]
      "heading": "Every connection is private",
      "voiceover": "Mỗi khi bạn gõ https://...",
      "on_screen_text": ["- tls", "- cert"], // optional
      "visual_cues": ["chart:bar"], // optional, parsed by _engine.js
      "duration_ms": 4320, // OVERWRITTEN by step2 with actual TTS length
    },
  ],
  "brand": {
    // injected as CSS vars
    "brandColor": "#3B82F6",
    "accentColor": "#F59E0B",
    "fontFamily": "Inter",
  },
}
```

`duration_ms` is the only timing source for both audio and video. Step 2 overwrites it with the measured TTS length (plus any padding to match the LLM's estimate), so the two streams can never drift apart.

## Audio pipeline (step 2)

1. `edge-tts --voice <v> --text <t> --write-media scene-N.mp3` — `--text=<t>` (with `=`) prevents argparse injection when voiceover starts with `-`.
2. Probe actual length: `ffmpeg -i scene-N.mp3 -f null -` → parse `time=HH:MM:SS.MS` from stderr.
3. Overwrite `scene.duration_ms` with the measured length.
4. Pad to `duration_ms`: `ffmpeg -i scene-N.mp3 -af apad -t <dur> -c:a libmp3lame -b:a 192k scene-N-padded.mp3`.
5. Concat: `ffmpeg -f concat -i list.txt -c copy all.mp3` (copy is safe here because every clip is LAME-encoded with the same bitrate).
6. On TTS failure, write a silent MP3 via `anullsrc=r=24000:cl=mono -t <dur>` and emit `warnings: ["tts_failed:scene-N"]` in the SSE `complete` event.

## Deployment

**Local self-hosted** (recommended for MVP):

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install
npm run setup          # verify the toolchain + install Playwright Chromium
pip install edge-tts  # optional, but without it the narration is silent
npm start
# → http://localhost:3000
```

Chromium is **not** downloaded by `npm install`: `npm run setup` does it explicitly
(~150 MB, one time) so nobody gets a surprise download. Re-run it if you see
"Executable doesn't exist" errors.

Each user runs their own instance. Pre-rendered sample videos in `samples/` show what the system produces — no installation required to evaluate the output.

## Why these choices

- **Fastify over Express**: better async handling, built-in JSON schema, ~2x faster.
- **Playwright over Puppeteer**: better API, more reliable, headless Chromium baked in.
- **HTML templates over canvas drawing**: easy to author, easy to read, easy to modify — the template _is_ the design.
- **Deterministic render by default**: makes the output a pure function of `(template, data.json, fps)` — critical for cache keys, CI tests, and reproducible demos.
- **Python edge-tts over npm wrapper**: the npm wrapper has a hardcoded token that Microsoft rotates. The Python `edge-tts` package fetches a fresh token per request.
- **SSE over WebSocket**: progress is one-way and rarely needs to be reconnected. SSE is much simpler to serve and proxy.
- **In-memory queue**: MVP-scale, no DB needed. Swap to BullMQ + Redis when the queue needs to survive restarts or scale beyond one process.

## API contract

See [`api.md`](api.md) for the full REST + SSE spec.
