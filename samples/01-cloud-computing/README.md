# 01 — Cloud Computing (Tech Explainer)

> **Template:** Tech Explainer
> **Duration:** 60s
> **Render status:** ✅ done

## Concept

Video giải thích Cloud Computing cho người mới bắt đầu — phù hợp với audience IT/engineering, dùng làm intro cho học sinh / nhân viên mới onboard.

## Render artifacts

| File | Size | Description |
|---|---|---|
| `video.mp4`     | ~330 KB | Final rendered video (60s, 1920×1080 @ 30fps) |
| `script.json`   | ~5 KB   | Generated script (6 scenes, LLM-rewritten Vietnamese) |
| `durations.json`| ~1 KB   | Per-scene actual TTS duration + frame counts |
| `audio/`        | ~80 KB  | TTS MP3 files (one per scene, from `tmp/jobs/`) |

> Note: `audio/` files aren't in the repo (would duplicate video.mp4). They're in `tmp/jobs/<jobId>/audio/` when re-rendered.

## Scenes (final, from script.json)

1. **Hook** — "Cloud Computing là gì? Và tại sao nó lại quan trọng đến vậy?"
2. **Problem** — "Đúng rồi, khái niệm này nghe phức tạp, nhưng thực ra không khó hiểu đâu."
3. **Concept** — "Hãy tưởng tượng bạn không cần mua server..."
4. **Deep dive** — Three core parts: input processing, transformation, output delivery
5. **Example** — Real-world use case with numbers
6. **Outro + CTA** — "Hiểu Cloud Computing sẽ giúp bạn làm việc hiệu quả hơn."
