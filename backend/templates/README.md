# Backend templates

This directory contains the HTML templates that step 4 renders to MP4 via Playwright + ffmpeg, plus the shared engine all three templates import.

| Template | File | Style |
|----------|------|-------|
| `tech-explainer` | `tech-explainer.html` | Clean, dark editorial, large centered type, decorative lines |
| `promo`          | `promo.html`          | High-energy, bold oversized text, pulsing background, CTA button |
| `tutorial`       | `tutorial.html`       | Structured step cards, slide-in animations, progress bar |

## How rendering works

1. `step4-render.js` writes the per-job `data.json` to the workdir.
2. A tiny local HTTP server serves these HTML files + the data.json (via `/` for templates and `/_data/` for workdir).
3. Playwright opens the template URL in headless Chromium at 1920×1080.
4. The template + `_engine.js` animate through each scene.
5. **Deterministic path (default):** the renderer calls `page.evaluate(window.__seek, tMs)` for each frame, takes a `page.screenshot`, and pipes the PNGs through ffmpeg's `image2` input. Output is bit-for-bit reproducible.
6. **Realtime path (`DETERMINISTIC_RENDER=0`):** the page's own scheduler runs to completion; `page.video()` records to a webm. The renderer reads `window.__t0_offset_ms` to align audio with the first animation frame via `ffmpeg -itsoffset`.
7. ffmpeg-static muxes audio (concatenated TTS clips, `apad`-padded) into the MP4.

## How to add a new template

1. Create `<name>.html` that:
   - Sets `viewport: 1920×1080` (or scales appropriately)
   - Includes `_engine.js` via `<script src="_engine.js"></script>`
   - Calls `window.fineVideoEngine.run(data, mount)` where `mount(els, scene)` returns a per-scene DOM element + `activate` / `deactivate` hooks
   - Reads `data.json` (querystring `?data=_data/data.json`)
   - For realtime path: sets `window.__renderDone = true` when the animation finishes
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

## Shared engine API (`_engine.js`)

`window.fineVideoEngine` exposes:

| Method / property | Purpose |
|---|---|
| `engine.run(data, mount, options?)` | Wire up the animation. `data` is the per-job `data.json`; `mount(els, scene)` builds the DOM for one scene. |
| `window.__seek(t_ms)` | (set by `run`) Move the animation clock to `t_ms` so the renderer can screenshot any moment. |
| `window.__duration()` | (set by `run`) Return the total scene length in ms. |
| `window.__t0_offset_ms` | (set by `run`) Milliseconds between `recordVideo` start and the first animation frame. Used by the realtime path for audio alignment. |
| `window.__renderDone` | (set by `run`) `true` when the animation reaches the end of the timeline. |

`options.cueRenderer(visualCue)` lets a template override the default visual cue renderer. See `defaultCueRenderer` in `_engine.js` for the baseline behavior (handles `code` cues out of the box).

## `visual_cues` shape

Each scene in `data.scenes[i].visual_cues` (optional) is an array of cue objects:

```jsonc
{
  "type": "code",           // "code" | "chart" | "icon" | custom
  "content": "git rebase -i HEAD~3",
  "position": "bottom"      // optional: "top" | "bottom" | "center"
}
```

Templates decide which cue types they support and how to render them. The default renderer in `_engine.js` produces a monospace box at the bottom of the screen.
