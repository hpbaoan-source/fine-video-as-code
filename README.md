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

**The 4-step pipeline:**

1. **Scripting** — form data + LLM rewrite → `script.json`. (Or use a `presetScript` for curated scripts.)
2. **TTS** — Edge-TTS generates per-scene audio, measures actual duration → `durations.json`
3. **Asset generation** — Optional Satori step (currently no-op; templates generate visuals dynamically)
4. **Render** — Playwright + headless Chromium opens an HTML template, records the animated playback, ffmpeg-static muxes with audio → MP4

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

The first render takes ~3 min (Playwright downloads Chromium + TTS for all scenes); subsequent renders are ~1.5-2.5× realtime.

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

Full spec: [`docs/api.md`](docs/api.md)

---

## Demo samples

Three real MP4s rendered end-to-end via the live server, committed to the repo:

| Sample | Template | Duration | Size | Link |
|---|---|---|---|---|
| How HTTPS Works | Tech Explainer | 87s | 1.5 MB | [video.mp4](samples/01-how-https-works/video.mp4) |
| Một ngày của lập trình viên | Promo / Ad | 61s | 1.2 MB | [video.mp4](samples/02-a-day-in-code/video.mp4) |
| 5 Git commands cứu mạng bạn | Tutorial | 102s | 0.7 MB | [video.mp4](samples/03-git-5-commands/video.mp4) |

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
│   ├── workflow/          # step1-script, step2-tts, step3-assets, step4-render
│   └── templates/         # 3 HTML templates for Playwright rendering
│       ├── tech-explainer.html
│       ├── promo.html
│       └── tutorial.html
├── samples/               # 3 demo videos (rendered, ~3.4 MB total)
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

All milestones done. The system runs end-to-end on a fresh `npm install && npm start`.

---

## Known limitations

- **First render takes ~3 min** — Playwright downloads Chromium on first run (~150MB). Cached after.
- **TTS is silent if `edge-tts` is missing** — `pip install edge-tts` to enable. Silent fallback keeps the rest of the pipeline working.
- **Asset step is a no-op** — Templates generate visuals dynamically; PNG assets aren't required.
- **No background music yet** — UI has a checkbox, but no implementation.
- **Single-process queue** — concurrency=1; one video at a time. Swap to BullMQ for scale.
- **No auth** — intended for local use. Add a reverse proxy for production.

---

## Contributing

PRs welcome. Read [`docs/contributing.md`](docs/contributing.md) for the rules.

Report bugs: [GitHub Issues](https://github.com/hpbaoan-source/fine-video-as-code/issues).

---

## License

[MIT](LICENSE) © 2026 Huỳnh Phương Bảo An
