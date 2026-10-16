# Backend templates

This directory contains the HTML templates that step 4 renders to MP4 via Playwright + ffmpeg.

| Template | File | Style |
|----------|------|-------|
| `tech-explainer` | `tech-explainer.html` | Clean, dark editorial, large centered type, decorative lines |
| `promo`          | `promo.html`          | High-energy, bold oversized text, pulsing background, CTA button |
| `tutorial`       | `tutorial.html`       | Structured step cards, slide-in animations, progress bar |

## How rendering works

1. `step4-render.js` writes the per-job `data.json` to the workdir.
2. A tiny local HTTP server serves these HTML files + the data.json (via `/` for templates and `/_data/` for workdir).
3. Playwright opens the template URL in headless Chromium at 1920×1080.
4. The template reads `data.json` and animates through each scene using CSS transitions.
5. `page.video()` records the page activity to a webm file.
6. ffmpeg-static converts webm → mp4 (no audio), then muxes with concatenated TTS audio.

## How to add a new template

1. Create `<name>.html` that:
   - Sets `viewport: 1920×1080` (or scales appropriately)
   - Reads `data.json` (querystring `?data=_data/data.json`)
   - Animates through each scene in `data.scenes`
   - Sets `window.__renderDone = true` when finished
2. Add a mapping in `step4-render.js`:
   ```js
   const TEMPLATE_FILES = {
     "tech-explainer": "tech-explainer.html",
     promo: "promo.html",
     tutorial: "tutorial.html",
     "my-new-template": "my-new-template.html",  // add here
   };
   ```
3. Add a pattern in `step1-script.js` under `TEMPLATES["my-new-template"]`.
4. Add a choice in the form's template selector (`web/index.html`).
