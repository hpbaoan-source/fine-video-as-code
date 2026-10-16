# API Reference

> **Status:** 🚧 Placeholder — full spec sẽ được bổ sung ở Phase 1 (Backend core).

## Endpoints

### `POST /api/generate`

Tạo job mới từ form data.

**Request body:**

```json
{
  "topic": "Giải thích Cloud Computing",
  "template": "tech-explainer",
  "language": "vi",
  "voice": "vi-VN-HoaiMyNeural",
  "duration": 60,
  "fps": 30,
  "resolution": "1080p",
  "aspectRatio": "16:9",
  "brandColor": "#3B82F6",
  "accentColor": "#F59E0B",
  "fontFamily": "Inter",
  "backgroundMusic": false,
  "maxScenes": 6,
  "aiModel": "gemini-flash",
  "outputFilename": ""
}
```

**Response 200:**

```json
{
  "jobId": "abc123",
  "statusUrl": "/api/status/abc123",
  "downloadUrl": "/api/download/abc123"
}
```

### `GET /api/status/:jobId` — Server-Sent Events

**Event types:**

- `step-start` — `{ step, name }`
- `step-progress` — `{ step, percent }`
- `step-done` — `{ step, output }`
- `log` — `{ message }`
- `complete` — `{ downloadUrl, duration }`
- `error` — `{ message }`

### `GET /api/download/:jobId`

Trả về file `video/mp4`.

### `GET /health`

Health check — trả về `{ status: "ok", version: "0.1.0" }`.

## Validation

Tất cả input được validate bằng Zod schema. Lỗi trả về 400 với message chi tiết.

## Error codes

| Code | Meaning |
|---|---|
| 400 | Validation failed |
| 404 | Job not found |
| 410 | Job expired (after download) |
| 500 | Internal error (workflow crash) |
| 503 | Job queue full (quota exceeded) |

## Default values

Defaults are neutral and overridable per-job. The values below are what users get when they don't touch the advanced options:

| Field | Default | Notes |
|---|---|---|
| `brandColor` | `#3B82F6` | Blue-500 (neutral, professional) |
| `accentColor` | `#F59E0B` | Amber-500 (warm) |
| `fontFamily` | `Inter` | Open-source, multilingual |
| `fps` | `30` | Standard web video |
| `resolution` | `1080p` | 1920×1080 |
| `aspectRatio` | `16:9` | YouTube / web standard |
| `maxScenes` | `6` | Keeps videos tight |
