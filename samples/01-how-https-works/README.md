# 01 — How HTTPS Works (Tech Explainer)

> **Template:** Tech Explainer · **Duration:** ~87s · **Render status:** ✅ done
> **Engine:** Playwright + HTML/CSS + ffmpeg-static (MIT-licensed)

## Concept

Hàng tỷ người nhìn thấy biểu tượng ổ khóa trên thanh địa chỉ mỗi ngày, nhưng ít ai biết nó thực sự đang làm gì. Video này giải thích HTTPS từ góc nhìn kỹ thuật trong 90 giây: vấn đề của HTTP thuần, lớp mã hóa TLS, chứng chỉ số, Diffie-Hellman, và mã hóa đối xứng AES.

## Visual style

- Dark editorial (`#0f1115` nền, `#3B82F6` accent, `#F59E0B` highlight)
- Tiêu đề lớn 92px, body 44px — đọc dễ ở 1920×1080
- Decorative lines sweep in/out mỗi scene (motion via CSS transition)
- Step marker dưới cùng phải (`01 / 07`) giúp track tiến độ

## Render artifacts

| File | Size | Description |
|---|---|---|
| `video.mp4` | 1.5 MB | Final rendered video, 1920×1080, ~87s |
| `script.json` | 2.6 KB | Pre-written Vietnamese script (7 scenes) |

## Scenes (from script.json)

1. Hook — ổ khóa trên URL
2. Vấn đề của HTTP thuần (man-in-the-middle)
3. TLS — giao thức bên dưới HTTPS
4. Bước 1: Xác minh danh tính server (chứng chỉ số)
5. Bước 2: Diffie-Hellman key exchange
6. Bước 3: AES-256 symmetric encryption
7. Tóm lại — kỳ công thầm lặng

## Re-render

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

Render time on Ryzen 5 7520U: ~2 minutes (Playwright Chromium is faster than Remotion's bundler for this use case).
