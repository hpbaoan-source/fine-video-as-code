# Backend libraries

> **Status:** 🚧 Placeholder — sẽ populate khi cần.

- `ai-script.js` — LLM adapter (Claude / Gemini / GPT). Reads `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` from env. Falls back to template-only mode if no key set.
- `job-queue.js` — In-memory job tracker (Map<jobId, JobState>). M2.
- `logger.js` — pino logger config. Currently inline in `server.js`.
- `ffmpeg.js` — FFmpeg wrappers (probe duration, extract audio, normalize loudness). M3.
