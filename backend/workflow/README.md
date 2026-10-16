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

The old pipeline had a Step 3 (asset generation, Satori → PNG) from the
Remotion era. It became a no-op when we migrated to Playwright — the
HTML templates embed their own visuals — and the file was deleted.
Step numbers in event names and SSE `step` fields are kept stable so
existing clients keep working.
