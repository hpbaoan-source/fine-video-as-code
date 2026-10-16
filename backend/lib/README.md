# Backend lib

Shared utilities.

| File | Purpose |
|---|---|
| `schema.js`     | Zod schemas for input/output validation. Single source of truth. |
| `job-store.js`  | In-memory job state + per-job event emitter. GC every 60s. |
| `job-queue.js`  | Single-process serial executor (concurrency=1). |
| `llm-client.js` | OpenAI-compatible chat completions. Reads `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` env vars. Throws on missing key. |
