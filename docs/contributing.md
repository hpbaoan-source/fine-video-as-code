# Contributing

> **Status:** ✅ Live. The MVP is shipped; this guide is the maintained process for adding to it.

## Quick rules

- **License:** Every contribution must be MIT-compatible. The repo bundles `playwright` (Apache 2.0) and `ffmpeg-static` (LGPL); both are MIT-clean. Anything that pulls in a commercial-source dependency (Remotion, Motion Canvas, etc.) is rejected.
- **Code style:** Native Node.js — no ESLint, no Prettier, no TypeScript. Style is whatever's already in the file; 2-space indent, single quotes, no semicolons is the dominant pattern. Run `node --check <file>` if you're unsure.
- **Tests:** Add a `node --test` case in `backend/tests/` for any new logic. We don't pull in Jest/Vitest — the built-in test runner is the dependency.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Imperative mood ("add", not "added").
- **Branches:** `main` (stable) · `feat/<name>` · `fix/<name>`. PRs target `main`.

## Local dev

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install                 # also runs `npx playwright install chromium` (postinstall)
pip install edge-tts
npm run dev                 # auto-reload server
npm test                    # 27 tests, no extra deps
```

## Architecture in 30 seconds

- **`backend/server.js`** — Fastify entry, port 3000.
- **`backend/routes/`** — `generate` (POST), `status` (SSE), `download` (GET).
- **`backend/lib/`** — `schema.js` (Zod), `job-store.js` (in-memory), `job-queue.js` (serial), `path-guard.js` (security), `llm-client.js` (provider-agnostic, env-only).
- **`backend/workflow/`** — `step1-script.js` (LLM rewrite), `step2-tts.js` (edge-tts + apad), `step4-render.js` (Playwright + ffmpeg).
- **`backend/templates/`** — 3 HTML templates + shared `_engine.js`.
- **`web/`** — single-page form, vanilla JS, Tailwind CDN.

See [`architecture.md`](architecture.md) for the full picture.

## Adding a new template

Templates are HTML files in `backend/templates/` that drive a headless Chromium instance. The shared engine in `_engine.js` handles brand CSS variables, scene timing, and the `window.__seek(tMs)` API the deterministic renderer depends on.

### Step 1 — Create the HTML

`backend/templates/<name>.html` (1920×1080 viewport, dark theme to match the others):

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <title>My Template</title>
  <style>
    /* Read brand via CSS vars injected by _engine.js */
    :root { --brand: #3B82F6; --accent: #F59E0B; }
    body { width: 1920px; height: 1080px; background: #0a0c10; color: #fff; ... }
    /* your scene layout here */
  </style>
</head>
<body>
  <script src="_engine.js"></script>
  <script>
    window.fineVideoEngine.run(data, function mount(els, scene) {
      // Build per-scene DOM. Return { container, activate(t), deactivate(t) }
    });
  </script>
</body>
</html>
```

The engine handles timing, scene transitions, and `__seek` — your `mount` function only decides how a single scene looks.

### Step 2 — Register the template

Two places:

1. `backend/workflow/step4-render.js` — add to `TEMPLATE_FILES`:
   ```js
   const TEMPLATE_FILES = {
     "tech-explainer": "tech-explainer.html",
     promo: "promo.html",
     tutorial: "tutorial.html",
     "<name>": "<name>.html",        // <-- add here
   };
   ```
2. `backend/workflow/step1-script.js` — add to `TEMPLATES`:
   ```js
   const TEMPLATES = {
     "tech-explainer": { pattern: [...] },
     promo:          { pattern: [...] },
     tutorial:       { pattern: [...] },
     "<name>":       { pattern: [...scene shapes...] },  // <-- add here
   };
   ```
   The `pattern` is the scene skeleton the LLM fills in; without it, fallback-only mode kicks in.

### Step 3 — Add to the form selector

In `web/index.html`, append a `<option value="<name>">My Template</option>` inside the template `<select>`.

### Step 4 — Test it

```bash
npm test
node scripts/render-sample.js --template <name> --topic "Hello World"
```

If the sample renders and `ffprobe -show_streams samples/<job>/video.mp4` shows a non-zero audio and video stream, you're done.

## Adding a new visual cue type

`visual_cues` are template-specific overlays. The default renderer in `_engine.js` supports `code` (monospace box). To add a new one:

1. Add a renderer in `<template>.html` that handles your cue type:
   ```js
   window.fineVideoEngine.run(data, function mount(els, scene) {
     // ... standard scene DOM ...
     const cueEl = document.createElement('div');
     if (scene.visual_cues?.some(c => c.type === 'chart')) {
       // render chart, e.g. SVG bars
     }
     return { container: els.scene, activate() { /* show */ }, deactivate() { /* hide */ } };
   });
   ```
2. Optionally override the default cue renderer:
   ```js
   window.fineVideoEngine.run(data, mount, { cueRenderer: myCustomCueRenderer });
   ```
3. Document the cue type in `templates/README.md`.

## Adding a new TTS voice

Edit `backend/lib/schema.js` — the `voice` field is a per-language Zod enum. Add the new voice to the relevant language list and the form's voice selector in `web/index.html`.

Validate with `edge-tts --list-voices` first; the enum must match Microsoft Edge's actual voice IDs.

## Environment variables

The dev and start scripts auto-load `.env` via `node --env-file=.env`. Copy `.env.example` to `.env` once and fill in your values:

```bash
cp .env.example .env       # macOS / Linux
copy .env.example .env     # Windows
```

`.env` is gitignored. `.env.example` is committed as a template.

| Var | Default | Effect |
|---|---|---|
| `PORT` | `3000` | Fastify listen port |
| `LLM_API_KEY` | — | If set, the LLM rewrites scenes. If unset, only the template fallback runs. |
| `LLM_BASE_URL` | `https://api.openai.com/v1` | OpenAI-compatible endpoint (OpenAI, DashScope compatible-mode, Ollama, etc.) |
| `LLM_MODEL` | `gpt-4o-mini` | Model ID passed to the endpoint |
| `DETERMINISTIC_RENDER` | `1` | `0` to use the realtime `recordVideo` path; default is the deterministic per-frame screenshot path |
| `PLAYWRIGHT_NO_SANDBOX` | — | Set to `1` to run Chromium without sandbox (e.g. inside containers without `--no-sandbox` allowed) |

The `tests/env.test.js` suite guards the `.env.example` pattern: it fails if `.env.example` is deleted, if `.env` is no longer in `.gitignore`, or if the Node version on the host no longer supports `--env-file`.

## Tests

```bash
npm test
```

27 tests across 5 files (`schema`, `path-guard`, `ffmpeg-args`, `duration-mapping`, `determinism`). No external deps. Add a test for any new logic you ship.

## Reporting issues

Open a GitHub issue with:

- Short description
- Steps to reproduce
- Expected vs actual behavior
- OS + Node version (`node -v` + `node -p "process.platform"`)
- Job log if available (SSE stream output)
