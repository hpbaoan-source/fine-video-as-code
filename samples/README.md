# Demo samples

4 video mẫu render sẵn — dùng để đánh giá nhanh chất lượng output mà không cần cài đặt.

| # | Tên | Template | Thời lượng | Size |
|---|-----|----------|------------|------|
| 0 | [Engine smoke test](00-engine-smoke/video.mp4) | Tech Explainer | 15s | 0.8 MB |
| 1 | [How HTTPS Works](01-how-https-works/video.mp4) | Tech Explainer | 96s | 2.0 MB |
| 2 | [Một ngày của lập trình viên](02-a-day-in-code/video.mp4) | Promo / Ad | 70s | 2.0 MB |
| 3 | [5 Git commands cứu mạng bạn](03-git-5-commands/video.mp4) | Tutorial | 111s | 2.1 MB |

**Total:** 4 video files (~7 MB), 4 script.json (pre-written Vietnamese).

Sample 00 là smoke test của engine: 3 scene ngắn, render trong ~3 phút — dùng để
kiểm tra template sau khi sửa mà không phải chờ cả video dài.

## What's new (v2)

These samples replace the earlier v1 set (cloud-computing, SaaS promo, Jira tutorial). Three changes:

- **Engine:** Playwright + headless Chromium + HTML/CSS templates + ffmpeg-static — one permissive licence for the whole stack, no bundler in the way.
- **Scripts:** Hand-written Vietnamese scripts (not LLM-generated). Each scene is a real product of editing + research, not a template fill-in.
- **Visuals:** Per-template distinct style — clean dark editorial (tech) / bold scale-up (promo) / slide-in step cards (tutorial).

## How they were rendered

Each sample was rendered end-to-end via `POST /api/generate` with a `presetScript` field pointing to the pre-written `script.json`. The pipeline runs:

1. **Step 1 (scripting)** — loads `presetScript` instead of running LLM/template
2. **Step 2 (TTS)** — Python `edge-tts` generates per-scene audio (concatenated, ~5-18s per scene)
3. **Step 4 (render)** — Playwright + headless Chromium opens the template HTML; the deterministic path screenshots one frame at a time (1920×1080 PNG → ffmpeg → MP4), ffmpeg-static muxes the audio track

Render time on this machine: ~3 min for the 15 s smoke test, ~10–15 min per demo video
(one screenshot per frame). The first render downloads Chromium (~150 MB) and takes
longer; subsequent renders are faster.

## Re-render

Either via the CLI:

```bash
npm run render-sample -- 01-how-https-works
npm run render-batch -- 01-how-https-works 02-a-day-in-code
```

…or via curl:

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "How HTTPS Works",
    "template": "tech-explainer",
    "language": "vi",
    "voice": "vi-VN-HoaiMyNeural",
    "presetScript": "samples/01-how-https-works/script.json",
    "outputFilename": "video"
  }'
```

Or open the form at `http://localhost:3000` and fill in the fields. For the demos, leave `topic` blank if you want the preset to take over.
