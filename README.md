# fine-video-as-code

> **Video-as-Code pipeline** — turn a short topic into a polished explainer video in minutes.
> Web form → JSON input → 4-step backend workflow → `.mp4` file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node: 20+](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](package.json)
[![Status: MVP scaffold](https://img.shields.io/badge/status-MVP%20scaffold-yellow)]()

---

## Overview

**fine-video-as-code** is an open-source pipeline for automated explainer-video generation. Fill in a short topic, pick a template, and the system produces a complete, voice-narrated video with synchronized visuals — no editing skills required.

**Three built-in templates:**

- 🎓 **Tech Explainer** — software architecture, code walkthroughs, technical concepts
- 📣 **Promo / Ad** — product videos, social ads, brand intros
- 📚 **Tutorial** — step-by-step guides, training, internal SOPs

**The 4-step pipeline:**

1. **Scripting** — form data → structured `script.json` (scenes + voiceover + visual cues)
2. **TTS** — Edge-TTS generates per-scene audio, measures exact duration → `durations.json`
3. **Asset generation** *(optional)* — Satori renders SVG charts/icons to PNG
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

**Requirements:** Node.js ≥ 20, FFmpeg ≥ 4.0.

Verify your environment with `npm run setup` — it checks all dependencies in one shot.

---

## Tech stack

| Layer | Tech | Why |
|---|---|---|
| Frontend | Vanilla HTML + JS + Tailwind (CDN) | Simple, no build step, easy to read |
| Backend | Node.js + Fastify | Async-native, fast, schema validation |
| Video engine | Remotion (programmatic) | React-based, frame-perfect timing |
| TTS | edge-tts (Node) | Free, multi-language voices |
| Asset gen | Satori + @resvg/resvg-js | SVG → PNG for charts/icons |
| Validation | Zod | Type-safe input parsing |
| Real-time | Server-Sent Events (SSE) | One-way progress push, no WebSocket overhead |

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
│   ├── server.js
│   ├── routes/            # /api/generate, /api/status, /api/download
│   ├── workflow/          # step1-script, step2-tts, step3-assets, step4-render
│   ├── lib/               # ai-script, job-queue, ffmpeg helpers
│   └── templates/         # Remotion compositions (3 built-in)
├── samples/               # 3 demo videos (rendered in M5)
│   ├── 01-cloud-computing/
│   ├── 02-saas-promo/
│   └── 03-jira-tutorial/
├── scripts/
│   ├── check-deps.js      # Node / npm / FFmpeg verifier
│   └── render-sample.js   # Re-render one sample
├── package.json
├── LICENSE                # MIT
└── README.md
```

---

## Form design: visible vs hidden

The form uses progressive disclosure — show minimum by default, expand for advanced control.

**🟢 Show by default** (everything needed to render a video):

- Topic (text)
- Template (3 options)
- Language (VI / EN)
- Voice (per-language options)
- Duration (30s – 180s slider)

**🟡 Hide by default** (advanced, default values applied if untouched):

- FPS, resolution, aspect ratio
- Brand color, accent color, font family
- Background music, max scenes
- AI model, output filename

---

## Roadmap

| Milestone | Deliverable | Status |
|---|---|---|
| **M0** | Repo scaffold + docs + UI placeholder | ✅ done |
| **M1** | Backend core + workflow orchestrator | ⏳ next |
| **M2** | Step 1: Scripting + AI integration | — |
| **M3** | Step 2 TTS + Step 4 Remotion render | — |
| **M4** | Frontend form + SSE progress | — |
| **M5** | 3 demo samples + final docs polish | — |

See [`docs/architecture.md`](docs/architecture.md) for the design.

---

## Contributing

PRs welcome. Read [`docs/contributing.md`](docs/contributing.md) for the rules.

Report bugs: [GitHub Issues](https://github.com/hpbaoan-source/fine-video-as-code/issues).

---

## License

[MIT](LICENSE) © 2026 Huỳnh Phương Bảo An
