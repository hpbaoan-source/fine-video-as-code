# 02 — Một ngày của lập trình viên (Promo / Ad)

> **Template:** Promo / Ad · **Duration:** ~61s · **Render status:** ✅ done
> **Engine:** Playwright + HTML/CSS + ffmpeg-static

## Concept

60 giây xuyên qua một ngày của dev: 6h sáng cafe, 9h flow state, 12h30 debug hell, 15h code review, 18h ship, tối nhìn lại. Nhịp nhanh, năng lượng cao — kiểu "a day in the life" mà nhiều bạn trẻ muốn xem trước khi vào nghề.

## Visual style

- High-energy: bold oversized type (140px heading), scale-up animations
- Background pulse dot (radial gradient) đổi size mỗi scene
- CTA button "GET STARTED →" ở scene cuối (màu accent `#F59E0B`)
- Topic bar dạng UPPERCASE letter-spacing ở trên cùng

## Render artifacts

| File | Size | Description |
|---|---|---|
| `video.mp4` | 1.2 MB | Final rendered video, 1920×1080, ~61s |
| `script.json` | 2.2 KB | Pre-written Vietnamese script (6 scenes) |

## Scenes (from script.json)

1. 6:00 SA — Cafe đen và TODO list
2. 9:00 — Flow state (lo-fi + terminal)
3. 12:30 — Debug hell (dấu phẩy, cổ điển)
4. 15:00 — Code review (học cách đồng đội nghĩ)
5. 18:00 — Ship it (CI xanh)
6. Outro — Mỗi ngày là một viên gạch

## Re-render

```bash
curl -X POST http://localhost:3000/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "Một ngày của lập trình viên",
    "template": "promo",
    "language": "vi",
    "voice": "vi-VN-HoaiMyNeural",
    "presetScript": "samples/02-a-day-in-code/script.json",
    "outputFilename": "video"
  }'
```

Render time: ~2 minutes.
