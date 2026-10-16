# Workflow

The 4-step pipeline orchestrator + per-step implementations.

| File | Step | Output |
|---|---|---|
| `index.js`        | Orchestrator | runs all 4 in sequence, emits SSE events |
| `step1-script.js` | 1. Scripting | `script.json` (template + optional LLM rewrite) |
| `step2-tts.js`    | 2. TTS       | `audio/scene-N.mp3` + `durations.json` |
| `step3-assets.js` | 3. Assets    | `assets/scene-N-cue-M.png` (Satori → resvg) |
| `step4-render.js` | 4. Render    | `<jobId>.mp4` (Remotion programmatic, with FFmpeg fallback) |

Each step is independent and can be tested in isolation by passing mock input.

If `@remotion/*` isn't installed, Step 4 falls back to a placeholder MP4 (or JSON manifest if FFmpeg is also missing). This keeps the rest of the pipeline testable in dev.
