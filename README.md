# fine-video-as-code

> **Video-as-Code pipeline** — turn a short topic into a polished explainer video in minutes.
> Web form → JSON input → 4-step backend workflow → `.mp4` file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![Status: live](https://img.shields.io/badge/status-M1%E2%80%93M5%20shipped-green)]()

---

## Overview

**fine-video-as-code** is an open-source pipeline for automated explainer-video generation. Fill in a short topic, pick a template, and the system produces a complete, voice-narrated video with synchronized visuals — no editing skills required.

**Three built-in templates:**

- 🎓 **Tech Explainer** — software architecture, code walkthroughs, technical concepts
- 📣 **Promo / Ad** — product videos, social ads, brand intros
- 📚 **Tutorial** — step-by-step guides, training, internal SOPs

**The 4-step pipeline:**

1. **Scripting** — form data → structured `script.json` (template + LLM rewrite of voiceover)
2. **TTS** — Edge-TTS generates per-scene audio, measures actual duration → `durations.json`
3. **Asset generation** — Satori renders SVG visual cues to PNG (optional, no-op if `satori` not installed)
4. **Render** — Remotion programmatic API renders frame-perfect MP4 with audio sync

---

## Quick start

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install
npm start
# → opens http://localhost:3000
```

**Requirements:** Node.js ≥ 20.
**Optional:** Python `edge-tts` (`pip install edge-tts`) for TTS — without it, audio is silent.

The first render takes ~2 min (Remotion's Chromium download); subsequent renders are ~1-1.5× realtime.

---

## Tech stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Vanilla HTML + JS + Tailwind (CDN) | Simple, no build step, easy to read |
| Backend | Node.js + Fastify | Async-native, fast, schema validation |
| Video engine | Remotion (programmatic) | React-based, frame-perfect timing |
| TTS | Python `edge-tts` (free MS Edge voices) | Multi-language, high quality |
| Asset gen | Satori + @resvg/resvg-js | SVG → PNG, no headless browser needed |
| Validation | Zod | Type-safe input parsing |
| Real-time | Server-Sent Events (SSE) | One-way progress push, no WebSocket overhead |

---

## API at a glance

```bash
# Start a job
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
| Cloud Computing | Tech Explainer | 60s | 330 KB | [video.mp4](samples/01-cloud-computing/video.mp4) |
| SaaS Productivity Promo | Promo / Ad | 30s | 664 KB | [video.mp4](samples/02-saas-promo/video.mp4) |
| Jira Tempo Tutorial | Tutorial | 90s | 1.1 MB | [video.mp4](samples/03-jira-tutorial/video.mp4) |

Each sample folder also has the `script.json` and `durations.json` produced by the pipeline — useful for debugging, replay, or as inputs to other tools.

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
│   └── templates/         # 3 Remotion compositions + entry point
├── samples/               # 3 demo videos (rendered, ~2.1 MB total)
│   ├── 01-cloud-computing/
│   ├── 02-saas-promo/
│   └── 03-jira-tutorial/
├── scripts/
│   ├── check-deps.js      # Node / npm verifier
│   └── render-sample.js   # Re-render one sample
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
| **M3** | Step 2 TTS (edge-tts) + Step 3 assets (satori) + Step 4 render (Remotion) | ✅ |
| **M4** | Frontend form + SSE progress UI | ✅ |
| **M5** | 3 demo samples rendered + committed | ✅ |

All 6 milestones are done. The system runs end-to-end on a fresh `npm install && npm start`.

---

## Known limitations

- **First render is slow (~2 min)** — Remotion downloads Chromium on first bundle. Cached after.
- **TTS is silent if `edge-tts` is missing** — `pip install edge-tts` to enable. Silent fallback keeps the rest of the pipeline working.
- **Asset step is a no-op without satori** — Templates generate visuals dynamically; PNG assets aren't required.
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
