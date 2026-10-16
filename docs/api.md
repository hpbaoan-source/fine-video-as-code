# API Reference

> **Status:** ✅ Live. All endpoints implemented and covered by `node --test`.

The server is a Fastify app on port 3000 by default (`PORT` env var to override). It exposes a single job-based API: one POST kicks off a 3-step pipeline (scripting → TTS → render) and the client streams progress over Server-Sent Events.

---

## Endpoints

### `POST /api/generate`

Create a new video job.

**Request body (Zod-validated, partial — every field has a default):**

| Field | Type | Default | Notes |
|---|---|---|---|
| `topic` | string | — | Free-text topic. Used when `presetScript` is omitted. |
| `presetScript` | string (path) | — | Path to a hand-written `script.json` under the project. Skips the LLM step. Path must be inside the samples/ or scripts/ folder (validated by `isPathInside`). |
| `template` | enum | `tech-explainer` | `tech-explainer` \| `promo` \| `tutorial` |
| `language` | enum | `vi` | `vi` \| `en` |
| `voice` | enum | `vi-VN-HoaiMyNeural` | See [Voice enum](#voice-enum) below. Unknown values → HTTP 400. |
| `duration` | int (seconds) | 60 | Target total length. Hint for the LLM, not a hard cap. |
| `fps` | int | 30 | Frames per second for the deterministic render path. |
| `deterministic` | bool | `true` | If `true`, the renderer drives the page via `window.__seek` and screenshots per frame (bit-for-bit reproducible for identical input). If `false`, uses Playwright `recordVideo` and webm → mp4 (faster on slow machines, but not reproducible). Overridable by env: `DETERMINISTIC_RENDER=0`. |
| `brandColor` | hex | `#3B82F6` | Injected as `--brand` CSS var in the template. |
| `accentColor` | hex | `#F59E0B` | Injected as `--accent` CSS var. |
| `fontFamily` | string | `Inter` | Sets `body { font-family }`. |
| `outputFilename` | string | `null` | Optional. Must match `^[\w\- ]{1,80}$` — letters, digits, `_`, `-`, and spaces only, no path separators, no extension. The `.mp4` extension is appended server-side. Path traversal attempts → HTTP 400. |
| `maxScenes` | int 2-20 | 6 | Cap on scene count when LLM generates the script. |
| `aiModel` | string | `default` | Selects a configured LLM preset (see `backend/lib/llm-client.js`). |

**Response 200:**

```json
{ "jobId": "abc123def", "statusUrl": "/api/status/abc123def", "downloadUrl": "/api/download/abc123def" }
```

**Response 400 (validation):**

```json
{
  "error": "validation_failed",
  "details": [
    { "path": "voice", "message": "Invalid enum value. Expected 'vi-VN-HoaiMyNeural' | ..." }
  ]
}
```

---

### `GET /api/status/:jobId` — Server-Sent Events

Streams job progress until the job is `complete` or `failed`. The stream closes after the terminal event.

**Event types:**

| Event | Payload | When |
|---|---|---|
| `step-start` | `{ step: 1, name: "script" }` | A workflow step begins. |
| `step-progress` | `{ step, percent: 0-100 }` | Progress within a step. |
| `step-done` | `{ step, output }` | A step finished successfully. |
| `log` | `{ message }` | Free-form log line (e.g. ffmpeg progress, TTS duration). |
| `complete` | `{ downloadUrl, duration, warnings? }` | Final event. `warnings` is an array — currently `["tts_failed:scene-N"]` if a TTS clip fell back to silence. |
| `error` | `{ message }` | Terminal failure. Stream closes after this. |

**Example stream:**

```
event: step-start
data: {"step":1,"name":"script"}

event: step-progress
data: {"step":1,"percent":50}

event: step-done
data: {"step":1,"output":{"scenes":5}}

event: step-start
data: {"step":2,"name":"tts"}

event: log
data: {"message":"TTS: scene-1 = 4.32s"}

event: step-done
data: {"step":2,"output":{}}

event: step-start
data: {"step":4,"name":"render"}

event: log
data: {"message":"Deterministic: 285 frames @ 30fps (9.5s)"}

event: log
data: {"message":"✓ Final MP4: how-https-works.mp4 (3678.5 KB)"}

event: complete
data: {"downloadUrl":"/api/download/abc123def","duration":9.5}
```

---

### `GET /api/download/:jobId`

Returns the rendered MP4 as `video/mp4` with `Content-Disposition: attachment; filename="<outputFilename>.mp4"`. Job is deleted after successful download (single-shot).

---

### `GET /health`

Health check — returns `{ status: "ok", version: "0.1.0" }`.

---

## Voice enum

Validated against a Zod enum per language. Unknown values are rejected with HTTP 400 before the job is queued.

| Language | Voices |
|---|---|
| `vi` | `vi-VN-HoaiMyNeural` (default), `vi-VN-NamMinhNeural` |
| `en` | `en-US-AriaNeural` (default), `en-US-GuyNeural`, `en-US-JennyNeural` |

---

## Error codes

| Code | Meaning |
|---|---|
| 400 | Validation failed (Zod schema or path-traversal) |
| 404 | Job not found or already downloaded |
| 500 | Internal error (workflow crash, ffmpeg failure) |
| 503 | Job queue full (single-process, concurrency=1) |

---

## Default values

| Field | Default | Notes |
|---|---|---|
| `template` | `tech-explainer` | — |
| `language` | `vi` | — |
| `voice` | `vi-VN-HoaiMyNeural` | Per-language default; see Voice enum |
| `duration` | `60` | Seconds (hint) |
| `fps` | `30` | Deterministic mode only |
| `deterministic` | `true` | Use `DETERMINISTIC_RENDER=0` to flip globally |
| `brandColor` | `#3B82F6` | Blue-500 (neutral, professional) |
| `accentColor` | `#F59E0B` | Amber-500 (warm) |
| `fontFamily` | `Inter` | Open-source, multilingual |
| `maxScenes` | `6` | Keeps videos tight |
