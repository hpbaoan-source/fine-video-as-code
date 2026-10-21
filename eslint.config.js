// ──────────────────────────────────────────────────────────────
// ESLint flat config (ESLint 9)
// ─────────────────────────────────────────────────────────────
// Run:  npm run lint          (check)
//       npm run lint:fix      (autofix what can be autofixed)
//
// Style is enforced by Prettier (`npm run format`), ESLint only
// looks for actual bugs: undefined variables, unused code,
// accidental globals, unsafe comparisons.
// ─────────────────────────────────────────────────────────────

import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: [
      "node_modules/**",
      "tmp/**",
      "output/**",
      "test-results/**",
      "playwright-report/**",
      "docs/gallery/**",
      "samples/**/*.mp4",
    ],
  },

  // ── Node / ESM code (backend, scripts, tooling) ──────────────
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
    rules: {
      ...js.configs.recommended.rules,
      // Dead code is a warning, not a build breaker — the backend
      // tree still carries a few leftovers we do not want to block
      // CI on.
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      // `catch {}` with an intentional swallow is fine.
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": "off",
      eqeqeq: ["error", "smart"],
      "prefer-const": "error",
      "no-var": "error",
      "no-return-await": "error",
      "no-throw-literal": "error",
    },
  },

  // ── Browser code (web portal, in-page render engine) ────────
  {
    files: ["web/js/**/*.js", "backend/templates/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-console": "off",
    },
  },

  // ── Playwright drivers ──────────────────────────────────────
  // The callbacks handed to page.evaluate() / waitForFunction()
  // execute inside the browser context, so `window` and `document`
  // are valid there even though the file itself runs in Node.
  {
    files: ["backend/workflow/step4-render.js", "scripts/preview-scenes.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },

  // ── One-off Playwright helpers at the repo root ────────────
  // Small screenshot/probe scripts (e.g. `.fv-shot.mjs`) live at the
  // repo root and drive a browser the same way.
  {
    files: ["*.mjs"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
];
