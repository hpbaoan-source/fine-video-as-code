# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

The upgrade wave: a shared design system, a cleaner repository, and a CI pipeline
that keeps the tree honest.

### Added

- **Shared design tokens** (`shared/design-tokens.css`) — one source of truth for
  colour, spacing, radius, typography and motion. The file is consumed by both the
  video templates (rendered by Playwright) and the web portal (served by Fastify),
  so a token change lands everywhere at once. `--fv-brand` / `--fv-accent` remain
  overridable per render (the portal exposes two colour pickers).
- **Two-column scene layout** — a `split` layout variant (hero on the left, content
  on the right) next to `title` and `stack`. `backend/lib/design-system.js` picks
  the variant per scene: a body block plus a hero cue yields `split`, and an
  explicit `scene.layout` always wins.
- **Auto-fit content** — `backend/lib/design-system.js` enforces the content budgets
  (heading length, bullet count, metric count, code lines, cue caption …) so a
  script written by a human or an LLM always fits the 1920×1080 safe area without
  overflowing. Every trim is reported back in the workflow log.
- **Per-word karaoke subtitles** — the bottom subtitle bar highlights the voiceover
  word by word while the scene clock advances, next to the five-bar equalizer. The
  highlight is derived from the timeline, so the deterministic render path stays
  bit-for-bit reproducible.
- **Template aliases** — `tech`, `techie`, `explainer`, `ad`, `promo-ad`, `howto`,
  `guide`, `sop`, `walkthrough` and friends are folded onto the canonical
  `tech-explainer` / `promo` / `tutorial` values _before_ validation. Hand-written
  scripts with an old template name no longer fail with "Unknown template".
- **CLI re-render** — `npm run render-sample -- <sample-folder>` re-renders one
  curated sample end-to-end (script → TTS → render) and writes it back to
  `samples/<name>/video.mp4`; `npm run render-batch -- <a> <b>` renders several
  samples in a row.
- **CI pipeline** (`.github/workflows/ci.yml`) — on every push and pull request:
  Node 22 → `npm ci` → Playwright Chromium → Edge-TTS → `npm run lint` →
  `npm run format:check` → `npm test`.
- **Quality gates** — ESLint 9 (flat config, `eslint.config.js`), Prettier
  (`.prettierrc.json`) and EditorConfig (`.editorconfig`) with the `lint`,
  `lint:fix`, `format`, `format:check` and `check` npm scripts.

### Changed

- **The server starts without a `.env` file.** `start`, `dev` and `render-sample`
  now use `node --env-file-if-exists=.env` instead of `--env-file=.env`.
- **`npm test` is cross-platform.** The script is now
  `node --test "backend/tests/**/*.test.js"` instead of a shell glob
  (`backend/tests/*.test.js`): the pattern is expanded by Node itself, so the same
  command works on Windows, macOS and Linux.
- **No surprise Chromium download.** The `postinstall` hook is gone; Chromium
  (~150 MB) is installed explicitly by `npm run setup`, which first verifies the
  whole toolchain and prints the fix for anything missing.
- **`nodemon` removed** from devDependencies — it was unused, the `dev` script uses
  Node's built-in `--watch` flag.
- **`scripts/check-deps.js` checks the tools this project actually uses**:
  the bundled `ffmpeg-static` binary (not a system ffmpeg), the `edge-tts` CLI and
  the Playwright Chromium installation — each with a copy-pasteable install hint.
- **`scripts/upload-moon.mjs` reads its configuration from the environment**
  (`MOON_API_URL`, `MOON_PASSCODE`). No credential and no default are committed any
  more; the script fails with a clear message when a variable is missing.
- **README rewritten** around the current feature set: real requirements (Node ≥ 22.9,
  Python + Edge-TTS, `npm run setup`), a working quick start, the environment
  variables from `.env.example`, an accurate repository map and the lint/test
  workflow.

### Security & robustness

- **`presetScript` can no longer read arbitrary files.** The field is user input and
  was joined onto the process cwd; it is now resolved against the repository's
  `samples/` directory only (`backend/lib/path-guard.js`), and anything else —
  absolute paths, `../` traversal, a non-JSON file — is rejected with a clear error.
- **`fontFamily` is a whitelist, not free text.** The value was interpolated straight
  into `body { font-family }`, which is a CSS-injection vector; it is now a Zod enum
  that mirrors the renderer's own font whitelist.
- **Dead input fields removed.** `backgroundMusic` and `aiModel` were never
  implemented — the form even said "not yet implemented" — yet both were part of the
  API contract. They are gone from the schema and from the form. Zod strips unknown
  keys, so an old client keeps working instead of getting a 400.
- **`maxScenes` is now actually applied.** The cap trims the template pattern (the
  closing scene is always kept) and feeds the duration-budget check.
- **The duration is validated against the scene budget.** A scene can never exceed
  30 s, so a `duration` longer than `scenes × 30 s` is rejected with HTTP 400
  instead of failing deep inside step 1 with a Zod error.
- **Rate limit on the render endpoint.** `POST /api/generate` accepts at most
  `RATE_LIMIT_JOBS` (default 3) requests per IP per minute; over the limit the
  answer is HTTP 429 with a `Retry-After` header.
- **The admin endpoint is gated.** `GET /api/jobs` answers 404 unless `ADMIN_TOKEN`
  is configured, and then requires the token (`X-Admin-Token`).
- **The job store is bounded.** Finished jobs expire after a TTL, stale jobs after a
  hard max age, and an expiring job emits a terminal `expired` event so an SSE client
  never waits forever.
- **Clean shutdown.** `SIGTERM`/`SIGINT` close the Chromium instances the renderer
  left open, stop the queue and reclaim the per-job temp directories.
- **The PNG frames are deleted after the encode.** A 100 s video wrote ~3000 frames
  (hundreds of MB) that stayed on disk forever.

### Fixed

- **Audio/video sync** — a NaN length probe from ffmpeg used to push the audio
  offset out of range; the offset is now clamped to the video length.
- **A failed job now reaches the client as an `error` event** instead of a stream
  that ends without a reason.
- **`resolution` and `aspectRatio` are honoured** by the renderer (they were
  validated but ignored).
- **The deterministic preview loop no longer spins** — the preview URL is only
  started when the render is not deterministic.

### Documentation

- **Sample metadata is measured, not estimated.** The demo tables in `README.md` and
  `samples/README.md` now carry the real `ffprobe` duration and file size of every
  committed MP4 (sample 02 renders 82.3 s against a 70 s script budget — the
  Vietnamese voiceover needs longer than the scene allows).
- **Gallery frames were re-extracted from the v2 videos.** `docs/gallery/*.png` shows
  the grid layout, the auto-fit scaling and the per-word karaoke captions instead of
  the pre-v2 frames.
- **The rendering section describes the repo directly.** It walks through
  Playwright/Chromium → Edge-TTS → ffmpeg-static and what each piece contributes,
  without comparing the project to any other stack.
- Every mention of the previous rendering stack is gone. The repo now describes only
  the current one — **Playwright + headless Chromium + vanilla HTML/CSS templates +
  Edge-TTS + ffmpeg-static** — and explains why it fits an MIT-licensed project
  (one permissive licence, no bundler, fast and reproducible renders).
- Branding neutralised: no organisation-specific names remain in the docs.
- `docs/architecture.md` — data flow, the rendering stack and its licences, the
  shared token file, the design-system middleware and the real test-file list.
- `docs/api.md` — the accepted template names and their aliases.
- `docs/contributing.md` — the lint → format → test workflow, the local dev setup
  and a table of what each test file covers.

### Known issues (carried over)

- `npm audit` reports high-severity advisories for `fastify@4` and
  `@fastify/static@7`. The fixes require the Fastify 5 major upgrade, which is a
  breaking change for the route layer and therefore not part of this wave.
- `backend/templates/illustrations/build_icons.js` still hardcodes a Windows path
  for the icon source folder. It is a one-off authoring tool, not part of the
  runtime — fix tracked separately.

---

## [0.1.0]

Initial public release: the 3-step pipeline (script → Edge-TTS → Playwright +
ffmpeg-static), three templates (Tech Explainer, Promo, Tutorial), the Fastify API
with SSE progress, the web form, three rendered demo samples and the
`node --test` suite.
