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
- **README rewritten** around the current feature set: real requirements (Node ≥ 20,
  Python + Edge-TTS, `npm run setup`), a working quick start, the environment
  variables from `.env.example`, an accurate repository map and the lint/test
  workflow.

### Documentation

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
