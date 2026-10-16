# 03 — 5 Git commands cứu mạng bạn (Tutorial)

> **Template:** Tutorial · **Duration:** ~102s · **Render status:** ✅ done
> **Engine:** Playwright + HTML/CSS + ffmpeg-static

## Concept

5 lệnh Git mà mọi dev nên biết nhưng ít người thành thạo: reflog, bisect, stash, worktree, rebase. Mỗi lệnh được trình bày như một bước trong tutorial, với giải thích vấn đề → giải pháp → ví dụ.

## Visual style

- Structured, calm: step cards slide in từ phải sang trái
- Step number chip (hình tròn brand-color) ở góc trên-trái card
- Progress bar ở dưới cùng (fill dần theo từng step)
- Topic bar "TUTORIAL · ..." ở góc trên-trái
- Heading 72px, body 36px — đọc thoải mái

## Render artifacts

| File | Size | Description |
|---|---|---|
| `video.mp4` | 0.7 MB | Final rendered video, 1920×1080, ~102s |
| `script.json` | 2.6 KB | Pre-written Vietnamese script (7 scenes) |

## Scenes (from script.json)

1. Intro — 5 lệnh Git bạn ước biết sớm hơn
2. **reflog** — cỗ máy thời gian, cứu commit nhầm
3. **bisect** — binary search trong lịch sử commit để tìm bug
4. **stash** — gạt qua việc dở để fix gấp
5. **worktree** — hai working trees cùng lúc
6. **rebase -i** — viết lại lịch sử branch cho gọn
7. Tổng kết — top 5% dev biết Git thật sự

## Re-render

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "5 Git commands cứu mạng bạn",
    "template": "tutorial",
    "language": "vi",
    "voice": "vi-VN-HoaiMyNeural",
    "presetScript": "samples/03-git-5-commands/script.json",
    "outputFilename": "video"
  }'
```

Render time: ~4 minutes (tutorial has 7 scenes, longest of the 3).
