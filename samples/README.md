# Demo samples

3 video mẫu render sẵn — dùng để đánh giá nhanh chất lượng output mà không cần cài đặt.

| # | Tên | Template | Thời lượng | Size | Status |
|---|-----|----------|------------|------|--------|
| 1 | Cloud Computing | Tech Explainer | 60s | ~330 KB | ✅ done |
| 2 | SaaS Productivity Promo | Promo / Ad | 30s | ~664 KB | ✅ done |
| 3 | Jira Tempo Tutorial | Tutorial | 90s | ~1.1 MB | ✅ done |

**Total:** 3 video files (~2.1 MB), 3 script.json + 3 durations.json.

## How they were rendered

Each sample was rendered by `POST /api/generate` on the running server, then the MP4 was downloaded via `GET /api/download/:jobId` and saved into this folder. The `script.json` and `durations.json` next to each video are the pipeline's intermediate outputs — kept for reproducibility and inspection.

## Re-render

To re-render a sample, run the server and POST the form data:

```bash
npm start &
# then open http://localhost:3000, fill the form, click Generate
# or use curl:
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Cloud Computing",
    "template": "tech-explainer",
    "language": "vi",
    "voice": "vi-VN-HoaiMyNeural",
    "duration": 60,
    "fps": 30
  }'
```

Render time on a Ryzen 5 7520U + Radeon iGPU: ~90-200s per video (mostly Remotion's Chromium + H.264 encoding).
