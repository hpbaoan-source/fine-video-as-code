# Workflow

The 3-step pipeline orchestrator + per-step implementations.

| File | Step | Output |
|---|---|---|
| `index.js`        | Orchestrator | runs all 3 in sequence, emits SSE events |
| `step1-script.js` | 1. Scripting | `script.json` (template + optional LLM rewrite) |
| `step2-tts.js`    | 2. TTS       | `audio/scene-N.mp3`, with each scene's `duration_ms` overwritten by the actual measured TTS length |
| `step4-render.js` | 4. Render    | `<jobId>.mp4` (Playwright + ffmpeg-static) |

Each step is independent and can be tested in isolation by passing mock input.

## Why the numbers skip from 2 to 4

Step 3 used to be a separate asset-generation pass (raster images written
to disk). The renderer now draws every visual inside the HTML template, so
that pass is no longer needed and the file was removed. Step numbers in
event names and SSE `step` fields are kept stable so existing clients keep
working.
