# API Reference

> **Status:** ✅ Live. All endpoints implemented and covered by `node --test`.

The server is a Fastify app on port 3000 by default (`PORT` env var to override). It exposes a single job-based API: one POST kicks off a 3-step pipeline (scripting → TTS → render) and the client streams progress over Server-Sent Events.

---

## Endpoints

### `POST /api/generate`

Create a new video job.

**Request body (Zod-validated, partial — every field has a default):**

| Field            | Type          | Default              | Notes                                                                                                                                                                                                                                                                                            |
| ---------------- | ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `topic`          | string        | —                    | Free-text topic. Used when `presetScript` is omitted — with a preset the field may be empty.                                                                                                                                                                                                     |
| `presetScript`   | string (path) | —                    | Path to a hand-written `script.json`. Skips the LLM step. **Must** be a `.json` file inside the repository's `samples/` directory (absolute paths, `..` traversal and other folders → HTTP 400).                                                                                                 |
| `template`       | enum          | `tech-explainer`     | `tech-explainer` \| `promo` \| `tutorial` — friendly aliases are accepted and folded onto these values (see [Template aliases](#template-aliases)).                                                                                                                                              |
| `language`       | enum          | `vi`                 | `vi` \| `en`                                                                                                                                                                                                                                                                                     |
| `voice`          | enum          | `vi-VN-HoaiMyNeural` | See [Voice enum](#voice-enum) below. Unknown values → HTTP 400.                                                                                                                                                                                                                                  |
| `duration`       | int (seconds) | 60                   | Target total length, 15–300 s. The duration is spread over the scenes and every scene is clamped to 0.5–30 s, so a request longer than `scenes × 30 s` → HTTP 400.                                                                                                                               |
| `fps`            | int           | 30                   | Frames per second for the deterministic render path.                                                                                                                                                                                                                                             |
| `deterministic`  | bool          | `true`               | If `true`, the renderer drives the page via `window.__seek` and screenshots per frame (bit-for-bit reproducible for identical input). If `false`, uses Playwright `recordVideo` and webm → mp4 (faster on slow machines, but not reproducible). Overridable by env: `DETERMINISTIC_RENDER=0`.    |
| `brandColor`     | hex           | `#3B82F6`            | Injected as `--brand` CSS var in the template.                                                                                                                                                                                                                                                   |
| `accentColor`    | hex           | `#F59E0B`            | Injected as `--accent` CSS var.                                                                                                                                                                                                                                                                  |
| `fontFamily`     | enum          | `Inter`              | Sets `body { font-family }`. Whitelisted (the renderer ignores anything else): `Inter`, `Georgia`, `Roboto`, `Roboto Slab`, `system-ui`, `Arial`, `Helvetica`, `Verdana`, `Times New Roman`, `Segoe UI`, `JetBrains Mono`, `Fira Code`, `Consolas`, `Menlo`, `monospace`, `serif`, `sans-serif`. |
| `resolution`     | enum          | `1080p`              | `480p` \| `720p` \| `1080p` \| `1440p` \| `2160p`.                                                                                                                                                                                                                                               |
| `aspectRatio`    | enum          | `16:9`               | `16:9` \| `9:16` \| `1:1` \| `4:3`.                                                                                                                                                                                                                                                              |
| `outputFilename` | string        | `null`               | Optional. Must match `^[\w\- ]{1,80}$` — letters, digits, `_`, `-`, and spaces only, no path separators, no extension. The `.mp4` extension is appended server-side. Path traversal attempts → HTTP 400.                                                                                         |
| `maxScenes`      | int 2-20      | 6                    | Cap on the scene count. The template pattern is trimmed to this many scenes — the last scene (outro / CTA) is always kept.                                                                                                                                                                       |

**Response 202 (accepted):**

```json
{
  "jobId": "abc123def",
  "status": "queued",
  "statusUrl": "/api/status/abc123def",
  "downloadUrl": "/api/download/abc123def"
}
```

**Response 400 (validation):**

```json
{
  "error": "Validation failed",
  "issues": [
    {
      "path": "voice",
      "message": "Invalid enum value. Expected 'vi-VN-HoaiMyNeural' | ...",
      "code": "invalid_enum_value"
    }
  ]
}
```

**Response 429 (rate limit):** every IP may start at most `RATE_LIMIT_JOBS` jobs per minute (default 3). The response carries `Retry-After` and `X-RateLimit-Limit` / `X-RateLimit-Remaining` headers.

```json
{ "error": "Too many render jobs — at most 3 per minute. Please retry shortly." }
```

---

### `GET /api/status/:jobId` — Server-Sent Events

Streams job progress until the job is `complete` or `failed`. The stream closes after the terminal event.

Every frame is a bare `data:` line — the event type lives in the JSON payload (`type`), not in an SSE `event:` field. The server sends a `:heartbeat` comment every 15 s so proxies keep the connection open.

**Event types:**

| `type`          | Payload                                                  | When                                                                                                         |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `step-start`    | `{ step: "script"\|"tts"\|"render", name }`              | A workflow step begins. `step` is the step id, not a number.                                                 |
| `step-progress` | `{ step, percent: 0-100 }`                               | Progress within a step.                                                                                      |
| `step-done`     | `{ step, output, meta }`                                 | A step finished successfully.                                                                                |
| `log`           | `{ message }`                                            | Free-form log line (e.g. ffmpeg progress, TTS duration).                                                     |
| `complete`      | `{ filename, size, duration_ms, downloadUrl, warnings }` | Final event. `warnings` is an array — currently `["tts_failed:scene-N"]` if a TTS clip fell back to silence. |
| `error`         | `{ message }`                                            | Terminal failure (the internal event type is `failed`). Stream closes after this.                            |
| `expired`       | `{ message }`                                            | The job was garbage-collected before the client connected.                                                   |

**Example stream:**

```
data: {"type":"step-start","step":"script","name":"Step 1: Script"}

data: {"type":"step-progress","step":"script","percent":50}

data: {"type":"step-done","step":"script","output":"script.json"}

data: {"type":"step-start","step":"tts","name":"Step 2: TTS"}

data: {"type":"log","message":"TTS: scene-1 = 4.32s"}

data: {"type":"step-start","step":"render","name":"Step 4: Render MP4"}

data: {"type":"log","message":"Deterministic: 285 frames @ 30fps (9.5s)"}

data: {"type":"complete","filename":"how-https-works.mp4","size":3763712,"duration_ms":9500,"downloadUrl":"/api/download/abc123def","warnings":[]}
```

---

### `GET /api/download/:jobId`

Returns the rendered MP4 as `video/mp4` with `Content-Disposition: attachment; filename="<outputFilename>.mp4"`. Job is deleted after successful download (single-shot).

---

### `GET /api/status/:jobId/snapshot`

The same information as the SSE stream, as plain JSON — useful for polling. Returns `{ jobId, status, currentStep, input, events, output, error, createdAt, startedAt, completedAt }`. `output` is `null` until the render finished.

---

### `GET /api/jobs` (admin)

Job statistics. Disabled unless `ADMIN_TOKEN` is set — without it the endpoint answers `404`. Send the token as `X-Admin-Token` header (or `?token=`).

---

### `GET /api/voices`

The voice whitelist per language: `{ "voices": { "vi": [...], "en": [...] } }`. Pass `?language=vi` to get one language only.

---

### `GET /api/presets`

The curated sample scripts in `samples/`, ready to be sent as `presetScript`:

```json
{
  "presets": [
    {
      "id": "01-how-https-works",
      "path": "samples/01-how-https-works/script.json",
      "template": "tech-explainer",
      "language": "vi",
      "voice": "vi-VN-HoaiMyNeural",
      "scenes": 7,
      "duration_ms": 96000,
      "topic": "How HTTPS Works"
    }
  ]
}
```

---

### `GET /health`

Health check — returns `{ status: "ok", phase: "idle"|"rendering", version: "0.1.0", uptime }`.

---

## Template aliases

The `template` field is normalised before validation (`backend/lib/design-system.js`),
so scripts and API calls may use a friendly name. The aliases are folded onto the
three canonical templates:

| Canonical        | Accepted aliases                                                                   |
| ---------------- | ---------------------------------------------------------------------------------- |
| `tech-explainer` | `tech`, `techie`, `explainer`, `explain`, `deep`                                   |
| `promo`          | `ad`, `promo-ad`, `social`, `teaser`                                               |
| `tutorial`       | `howto`, `how-to`, `guide`, `sop`, `walkthrough`, `top-list`, `checklist`, `steps` |

An unknown name is still rejected with HTTP 400.

---

## Voice enum

Validated against a Zod enum per language. Unknown values are rejected with HTTP 400 before the job is queued.

| Language | Voices                                                                                    |
| -------- | ----------------------------------------------------------------------------------------- |
| `vi`     | `vi-VN-HoaiMyNeural` (default), `vi-VN-NamMinhNeural`                                     |
| `en`     | `en-US-AriaNeural` (default), `en-US-GuyNeural`, `en-US-JennyNeural`, `en-US-DavisNeural` |

---

## Error codes

| Code | Meaning                                                                        |
| ---- | ------------------------------------------------------------------------------ |
| 400  | Validation failed (Zod schema, path-traversal, duration over the scene budget) |
| 404  | Job not found or already downloaded                                            |
| 429  | Rate limit — too many jobs from this IP                                        |
| 500  | Internal error (workflow crash, ffmpeg failure)                                |
| 503  | Job queue full (single-process, concurrency=1)                                 |

---

## Default values

| Field           | Default              | Notes                                         |
| --------------- | -------------------- | --------------------------------------------- |
| `template`      | `tech-explainer`     | —                                             |
| `language`      | `vi`                 | —                                             |
| `voice`         | `vi-VN-HoaiMyNeural` | Per-language default; see Voice enum          |
| `duration`      | `60`                 | Seconds (hint)                                |
| `fps`           | `30`                 | Deterministic mode only                       |
| `deterministic` | `true`               | Use `DETERMINISTIC_RENDER=0` to flip globally |
| `brandColor`    | `#3B82F6`            | Blue-500 (neutral, professional)              |
| `accentColor`   | `#F59E0B`            | Amber-500 (warm)                              |
| `fontFamily`    | `Inter`              | Open-source, multilingual                     |
| `resolution`    | `1080p`              | Frame size of the render                      |
| `aspectRatio`   | `16:9`               | —                                             |
| `maxScenes`     | `6`                  | Keeps videos tight                            |
