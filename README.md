# fine-video-as-code

> **Video-as-Code pipeline** — turn a short topic into a polished explainer video in minutes.
> Web form → JSON input → 4-step backend workflow → `.mp4` file.
> **MIT-licensed throughout, including the rendering engine.**

---

## Overview

**fine-video-as-code** is an open-source pipeline for automated explainer-video generation. Fill in a short topic, pick a template, and the system produces a complete, voice-narrated video with synchronized visuals — no editing skills required.

**Three built-in templates:**

- 🎓 **Tech Explainer** — software architecture, code walkthroughs, technical concepts
- 📣 **Promo / Ad** — product videos, social ads, brand intros
- 📚 **Tutorial** — step-by-step guides, training, internal SOPs

**The 3-step pipeline:**

1. **Scripting** — form data + LLM rewrite → `script.json`. (Or use a `presetScript` for curated scripts.)
2. **TTS** — Edge-TTS generates per-scene audio, pads each clip to its scene's `duration_ms` with `ffmpeg apad` → per-scene `mp3`.
3. **Render** — Playwright + headless Chromium opens an HTML template. By default the renderer is **deterministic** (`window.__seek` + per-frame screenshot → ffmpeg PNG stream → MP4); the realtime fallback (`recordVideo` webm) is opt-in via `DETERMINISTIC_RENDER=0`. ffmpeg-static muxes the audio track.

---

## Why Playwright + HTML/CSS (and not Remotion)

Earlier versions used [Remotion](https://www.remotion.pro) for rendering. Remotion is free for individuals and small companies, but its **"Remotion for Automators"** tier charges **$100/month minimum** for any prompt-to-video app — which is exactly what this project is. That licensing structure makes a free public MIT repo untenable.

We switched to **Playwright + headless Chromium + ffmpeg-static**:

- Playwright is **Apache 2.0** (MIT-compatible)
- ffmpeg-static is **LGPL with open-source build**
- The HTML templates are vanilla HTML + CSS + a tiny inline JS scheduler

Result: a fully MIT-clean stack, no per-render fees, and rendering is faster (Chromium only does the work, not a heavy Vite/Remotion bundler).

---

## Quick start

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install
npx playwright install chromium
pip install edge-tts
npm start
# → opens http://localhost:3000
```

**Requirements:** Node.js ≥ 20, Python 3.9+.
**Optional:** Python `edge-tts` (recommended for audio).

The first render takes ~3 min (Playwright downloads Chromium + TTS for all scenes). Subsequent renders scale with the video's total duration in **deterministic mode** (one Playwright screenshot per frame at the chosen `fps`), and ~1.5–2.5× realtime in the **realtime fallback** mode.

---

## Tech stack

| Layer | Tech | License | Why |
|---|---|---|---|
| Frontend | Vanilla HTML + JS + Tailwind (CDN) | MIT | Simple, no build step, easy to read |
| Backend | Node.js + Fastify | MIT | Async-native, fast, schema validation |
| Video render | Playwright + headless Chromium | Apache 2.0 | MIT-clean, no $100/mo Automators tier |
| TTS | Python `edge-tts` (free MS Edge voices) | MIT | Multi-language, no API key needed |
| Audio mux | ffmpeg-static | LGPL | Bundled binary, no system install needed |
| Validation | Zod | MIT | Type-safe input parsing |
| Real-time | Server-Sent Events (SSE) | — | One-way progress push, simpler than WS |

---

## API at a glance

```bash
# Start a job (with optional presetScript)
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Cloud Computing",
    "template": "tech-explainer",
    "language": "vi",
    "voice": "vi-VN-HoaiMyNeural",
    "duration": 60,
    "fps": 30,
    "brandColor": "#3B82F6",
    "accentColor": "#F59E0B"
  }'

# Or use a pre-written script
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "presetScript": "samples/01-how-https-works/script.json",
    "template": "tech-explainer",
    "language": "vi"
  }'

# Response
{ "jobId": "abc123def", "statusUrl": "/api/status/abc123def", ... }

# Stream progress (SSE)
curl http://localhost:3000/api/status/abc123def

# Download MP4 when done
curl -O http://localhost:3000/api/download/abc123def
```

**Output filename is sanitized server-side.** The optional `outputFilename` field accepts only letters, digits, `_`, `-`, and spaces (max 80 chars); the `.mp4` extension is appended by the server. Path traversal attempts are rejected with HTTP 400.

Full spec: [`docs/api.md`](docs/api.md)

---

## Demo samples

Three real MP4s rendered end-to-end via the live server, committed to the repo:

| Sample | Template | Duration | Size | Link |
|---|---|---|---|---|
| How HTTPS Works | Tech Explainer | 95.9s | 3.59 MB | [video.mp4](samples/01-how-https-works/video.mp4) |
| Một ngày của lập trình viên | Promo / Ad | 69.9s | 2.43 MB | [video.mp4](samples/02-a-day-in-code/video.mp4) |
| 5 Git commands cứu mạng bạn | Tutorial | 110.9s | 0.75 MB | [video.mp4](samples/03-git-5-commands/video.mp4) |

Each sample folder has the hand-written `script.json` used by the pipeline — useful for debugging, replay, or as a starting template for new demos.

See [`samples/README.md`](samples/README.md) for the full list and how to re-render.

---

## Repo structure

```
fine-video-as-code/
├── docs/
│   ├── agent-workflow.md  # System prompt for the AI agent (4-step pipeline)
│   ├── architecture.md    # Architecture diagram + data flow
│   ├── api.md             # REST + SSE API contract
│   └── contributing.md    # How to add templates, report bugs
├── web/                   # Frontend (vanilla HTML + JS)
│   ├── index.html
│   ├── css/style.css
│   ├── js/app.js
│   └── assets/
├── backend/               # Backend API + workflow orchestrator
│   ├── server.js          # Fastify entry, port 3000
│   ├── routes/            # generate, status (SSE), download
│   ├── lib/               # schema, job-store, job-queue, llm-client
│   ├── workflow/          # step1-script, step2-tts, step4-render
│   └── templates/         # 3 HTML templates + shared engine
│       ├── _engine.js     # window.fineVideoEngine — brand CSS vars, __seek, visual_cues
│       ├── tech-explainer.html
│       ├── promo.html
│       └── tutorial.html
├── samples/               # 3 demo videos (rendered, ~6.77 MB total)
│   ├── 01-how-https-works/
│   ├── 02-a-day-in-code/
│   └── 03-git-5-commands/
├── scripts/
│   └── check-deps.js      # Node / npm / Playwright / ffmpeg verifier
├── package.json
├── LICENSE                # MIT
└── README.md
```

---

## Roadmap

| Milestone | Deliverable | Status |
|---|---|---|
| **M0** | Repo scaffold + docs + UI placeholder | ✅ |
| **M1** | Backend core + workflow orchestrator (Fastify, SSE, queue) | ✅ |
| **M2** | Step 1: Scripting + AI integration (template + LLM rewrite) | ✅ |
| **M3** | Step 2 TTS (edge-tts) + Step 3 assets + Step 4 render (Playwright) | ✅ |
| **M4** | Frontend form + SSE progress UI | ✅ |
| **M5** | 3 demo samples rendered + committed | ✅ |
| **M6** | Migrate to MIT-clean rendering engine (Playwright + HTML) | ✅ |
| **M7** | Hand-written curated samples (3 invested scripts) | ✅ |
| **M8** | Git history cleanup (rewrite commit messages) | ✅ |
| **M9** | Audio/video sync fix + visual cues + deterministic render | ✅ |

All milestones done. The system runs end-to-end on a fresh `npm install && npm start`.

---

## Known limitations

- **First render takes ~3 min** — Playwright downloads Chromium on first run (~150MB). Cached after.
- **TTS is silent if `edge-tts` is missing** — the server falls back to a silent MP3 (`anullsrc`) and emits a `tts_failed:scene-N` warning in the SSE `complete` event. The video still renders, just without narration.
- **No background music yet** — UI has a checkbox, but no implementation.
- **Single-process queue** — concurrency=1; one video at a time. Swap to BullMQ for scale.
- **No auth** — intended for local use. Add a reverse proxy for production.
- **Voice list is curated, not open** — voices are validated against a per-language Zod enum (`vi-VN-HoaiMyNeural`, `vi-VN-NamMinhNeural`; `en-US-AriaNeural`, `en-US-GuyNeural`, `en-US-JennyNeural`). Unknown voices return HTTP 400.

---

## Contributing

PRs welcome. Read [`docs/contributing.md`](docs/contributing.md) for the rules.

Report bugs: [GitHub Issues](https://github.com/hpbaoan-source/fine-video-as-code/issues).

---

## License

[MIT](LICENSE) © 2026 Huỳnh Phương Bảo An
