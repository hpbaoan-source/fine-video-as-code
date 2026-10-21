# Demo samples

3 video mẫu render sẵn — dùng để đánh giá nhanh chất lượng output mà không cần cài đặt.

| # | Tên | Template | Thời lượng | Size |
|---|-----|----------|------------|------|
| 1 | [How HTTPS Works](01-how-https-works/video.mp4) | Tech Explainer | 87s | 1.5 MB |
| 2 | [Một ngày của lập trình viên](02-a-day-in-code/video.mp4) | Promo / Ad | 61s | 1.2 MB |
| 3 | [5 Git commands cứu mạng bạn](03-git-5-commands/video.mp4) | Tutorial | 102s | 0.7 MB |

**Total:** 3 video files (~3.4 MB), 3 script.json (pre-written Vietnamese).

## What's new (v2)

These samples replace the earlier v1 set (cloud-computing, SaaS promo, Jira tutorial). Three changes:

- **Engine:** Playwright + headless Chromium + HTML/CSS templates + ffmpeg-static — one permissive licence for the whole stack, no bundler in the way.
- **Scripts:** Hand-written Vietnamese scripts (not LLM-generated). Each scene is a real product of editing + research, not a template fill-in.
- **Visuals:** Per-template distinct style — clean dark editorial (tech) / bold scale-up (promo) / slide-in step cards (tutorial).

## How they were rendered

Each sample was rendered end-to-end via `POST /api/generate` with a `presetScript` field pointing to the pre-written `script.json`. The pipeline runs:

1. **Step 1 (scripting)** — loads `presetScript` instead of running LLM/template
2. **Step 2 (TTS)** — Python `edge-tts` generates per-scene audio (concatenated, ~5-10s per scene)
3. **Step 3 (assets)** — no-op (templates generate visuals dynamically; PNGs not needed)
4. **Step 4 (render)** — Playwright + headless Chromium opens the template HTML, records 1920×1080 webm, ffmpeg-static muxes with audio → final MP4

Render time on Ryzen 5 7520U: ~2-4 minutes per video. The first render downloads Chromium (~50MB) and takes longer; subsequent renders are faster.

## Re-render

Either via the form (use the "Advanced options" to point at a presetScript — currently requires manual API call) or via curl:

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
