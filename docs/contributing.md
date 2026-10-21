# Contributing

> **Status:** ✅ Live. The MVP is shipped; this guide is the maintained process for adding to it.

## Quick rules

- **License:** Every contribution must be MIT-compatible. The repo bundles `playwright` (Apache 2.0) and `ffmpeg-static` (LGPL); both are MIT-clean. Anything that pulls in a commercial-source dependency is rejected.
- **Code style:** Prettier owns the formatting (`.prettierrc.json`), ESLint owns the correctness checks (`eslint.config.js`). Run `npm run format` before you commit; do not hand-tune whitespace.
- **Tests:** Add a `node --test` case in `backend/tests/` for any new logic. We don't pull in Jest/Vitest — the built-in test runner is the dependency.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `test:`). Imperative mood ("add", not "added").
- **Branches:** `main` (stable) · `feat/<name>` · `fix/<name>`. PRs target `main`.

## Local dev

```bash
git clone https://github.com/hpbaoan-source/fine-video-as-code.git
cd fine-video-as-code
npm install                 # JS dependencies only — no browser download
npm run setup               # verify the toolchain + install Playwright Chromium
pip install edge-tts        # optional: needed for the narration
npm run dev                 # auto-reload server
npm test                    # node --test "backend/tests/**/*.test.js" — no extra deps
```

`npm run setup` is explicit on purpose: Chromium is ~150 MB, so it is never
downloaded behind your back during `npm install`.

## Quality gates

Run all three before opening a PR — CI runs exactly the same commands:

```bash
npm run lint          # ESLint 9 (flat config) — errors fail the build
npm run format:check  # Prettier — fails if a file is not formatted
npm test              # node --test "backend/tests/**/*.test.js"
```

Or run them in one go:

```bash
npm run check         # lint + format:check + test
```

Prettier currently formats `docs/`, `scripts/`, `.github/` and the root config
files; `backend/`, `shared/`, `web/` and `samples/` are excluded until that
workstream adopts the shared config (see `.prettierignore`).

## Architecture in 30 seconds

- **`backend/server.js`** — Fastify entry, port 3000.
- **`backend/routes/`** — `generate` (POST), `status` (SSE), `download` (GET).
- **`backend/lib/`** — `schema.js` (Zod), `design-system.js` (template aliases, content budgets, layout picking), `text.js` (pure text helpers), `job-store.js` (in-memory), `job-queue.js` (serial), `path-guard.js` (security), `llm-client.js` (provider-agnostic, env-only).
- **`backend/workflow/`** — `step1-script.js` (LLM rewrite), `step2-tts.js` (edge-tts + apad), `step4-render.js` (Playwright + ffmpeg).
- **`backend/templates/`** — 3 HTML templates + shared `_engine.js`.
- **`shared/design-tokens.css`** — colour / spacing / typography tokens shared by the portal and the templates.
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
     "<name>": "<name>.html", // <-- add here
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

3. `backend/lib/design-system.js` — add the canonical name to `TEMPLATES` and, if
   you want friendly aliases, to `TEMPLATE_ALIASES`.

### Step 3 — Add to the form selector

In `web/index.html`, append a radio button / option with `value="<name>"` inside the template group.

### Step 4 — Test it

```bash
npm test
npm run render-sample -- 01-how-https-works
```

If the sample renders and the produced MP4 has a non-zero audio and video stream, you're done.

## Adding a new visual cue type

`visual_cues` are template-specific overlays. The default renderer in `_engine.js` supports the baseline cue types. To add a new one:

1. Add a renderer in `<template>.html` that handles your cue type:
   ```js
   window.fineVideoEngine.run(data, function mount(els, scene) {
     // ... standard scene DOM ...
     const cueEl = document.createElement("div");
     if (scene.visual_cues?.some((c) => c.type === "chart")) {
       // render chart, e.g. SVG bars
     }
     return {
       container: els.scene,
       activate() {
         /* show */
       },
       deactivate() {
         /* hide */
       },
     };
   });
   ```
2. Optionally override the default cue renderer:
   ```js
   window.fineVideoEngine.run(data, mount, { cueRenderer: myCustomCueRenderer });
   ```
3. Add the cue type to the `VisualCueSchema` enum in `backend/lib/schema.js`.
4. Document the cue type in `backend/templates/README.md`.

## Adding a new TTS voice

Edit `backend/lib/schema.js` — the `voice` field is a per-language Zod enum. Add the new voice to the relevant language list and the form's voice selector in `web/index.html`.

Validate with `edge-tts --list-voices` first; the enum must match Microsoft Edge's actual voice IDs.

## Environment variables

The dev and start scripts auto-load `.env` when it exists, via
`node --env-file-if-exists=.env`. The file is **optional** — the server starts
without it. Copy `.env.example` to `.env` if you want to change the defaults:

```bash
cp .env.example .env       # macOS / Linux
copy .env.example .env     # Windows
```

`.env` is gitignored. `.env.example` is committed as a template.

| Var                     | Default                     | Effect                                                                                             |
| ----------------------- | --------------------------- | -------------------------------------------------------------------------------------------------- |
| `PORT`                  | `3000`                      | Fastify listen port                                                                                |
| `LLM_API_KEY`           | —                           | If set, the LLM rewrites scenes. If unset, only the template fallback runs.                        |
| `LLM_BASE_URL`          | `https://api.openai.com/v1` | OpenAI-compatible endpoint (OpenAI, DashScope compatible-mode, Ollama, etc.)                       |
| `LLM_MODEL`             | `gpt-4o-mini`               | Model ID passed to the endpoint                                                                    |
| `LLM_TIMEOUT_MS`        | `30000`                     | Per-request LLM timeout                                                                            |
| `DETERMINISTIC_RENDER`  | `1`                         | `0` to use the realtime `recordVideo` path; default is the deterministic per-frame screenshot path |
| `PLAYWRIGHT_NO_SANDBOX` | —                           | Set to `1` to run Chromium without sandbox (e.g. inside containers without `--no-sandbox` allowed) |
| `MOON_API_URL`          | —                           | Base URL of the optional upload service used by `scripts/upload-moon.mjs`                          |
| `MOON_PASSCODE`         | —                           | Passcode for that service — read from the environment, never committed                             |

The `tests/env.test.js` suite guards the `.env.example` pattern: it fails if `.env.example` is deleted, if `.env` is no longer in `.gitignore`, or if the Node version on the host no longer supports the `--env-file` flag.

## Tests

```bash
npm test
```

The script is `node --test "backend/tests/**/*.test.js"`. The pattern is quoted on
purpose: the glob is expanded by Node itself, not by the shell, so the same command
works on Windows, macOS and Linux. (Node's test runner only understands glob
patterns — passing a directory such as `backend/tests/` makes it try to load the
directory as a module. Glob patterns need Node ≥ 21; on Node 20 use
`node --test backend/tests/*.test.js`.)

The suite lives in `backend/tests/` and runs on the built-in Node test runner — no
extra dependencies:

| File                  | Covers                                                                        |
| --------------------- | ----------------------------------------------------------------------------- |
| `schema.test.js`      | Input/output validation, template aliases, voice enum.                        |
| `path-guard.test.js`  | Path-traversal blocking for `presetScript`.                                   |
| `ffmpeg-args.test.js` | The exact ffmpeg argv shape (padding, silence fallback).                      |
| `duration.test.js`    | Duration mapping between script, audio and frames.                            |
| `determinism.test.js` | Two identical renders produce identical bytes (skips if Chromium is missing). |
| `sync.test.js`        | Audio and video streams of a sample MP4 are within ±0.1 s.                    |
| `cleanup.test.js`     | Expired job workdirs are removed.                                             |
| `env.test.js`         | `.env.example` / `.gitignore` / `--env-file` guard.                           |

Add a test for any new logic you ship.

## Reporting issues

Open a GitHub issue with:

- Short description
- Steps to reproduce
- Expected vs actual behavior
- OS + Node version (`node -v` + `node -p "process.platform"`)
- Job log if available (SSE stream output)
