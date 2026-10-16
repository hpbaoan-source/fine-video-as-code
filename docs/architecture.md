# Architecture

> **Status:** 🚧 Placeholder — chi tiết sẽ được bổ sung ở Phase 1 (Backend core).

## High-level data flow

```
[User] → web/index.html
            │ (1) submit form
            ▼
       Backend API (POST /api/generate)
            │ (2) jobId
            ▼
       Job queue (in-memory)
            │
            ├─► (3a) Step 1: Scripting
            │      form data + AI (hybrid template + LLM) → script.json
            │
            ├─► (3b) Step 2: TTS
            │      script.json + edge-tts → audio/*.mp3 + durations.json
            │
            ├─► (3c) Step 3: Asset generation (optional)
            │      script.json + satori → assets/*.png
            │
            └─► (3d) Step 4: Render
                   script.json + durations.json + assets → output/<jobId>.mp4
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
| TTS | edge-tts (Node) | Free, multi-language voices |
| Asset gen | Satori + @resvg/resvg-js | SVG → PNG for charts/icons |
| Validation | Zod | Type-safe input parsing |
| Real-time | Server-Sent Events (SSE) | Simpler than WebSocket, one-way push |
| Process | execa | Promise-based subprocess |

## Deployment

**Local self-hosted** (recommended for MVP):

```bash
git clone <repo>
cd <repo>
npm install
npm start
# → http://localhost:3000
```

Each user runs their own instance. Pre-rendered sample videos in `samples/` show what the system can produce — no installation required to evaluate the output.

## Folder structure

See top-level [README.md](../README.md#repo-structure) for the full layout.

## API contract (preview)

See [`api.md`](api.md) for the full REST + SSE spec.

```
POST /api/generate
GET  /api/status/:jobId   (SSE stream)
GET  /api/download/:jobId
```
