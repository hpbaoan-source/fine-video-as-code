# Workflow steps

> **Status:** 🚧 Placeholder — sẽ implement ở Phase 1-3.

Four-step pipeline mapped to the agent workflow system prompt (`docs/agent-workflow.md`):

| Step | File | Status |
|------|------|--------|
| 1. Scripting | `step1-script.js` | M2 |
| 2. TTS | `step2-tts.js` | M3 |
| 3. Asset generation | `step3-assets.js` | M4 |
| 4. Render | `step4-render.js` | M3 |

The orchestrator `index.js` will chain these sequentially and stream progress via callbacks.
