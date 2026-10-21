// ──────────────────────────────────────────────────────────────
// check-deps.js — verify the toolchain this project actually uses
// ─────────────────────────────────────────────────────────────
// Run: `npm run setup`        → verify + install Playwright Chromium
//      `npm run setup:check`  → verify only
//      `node scripts/check-deps.js [--install]
//
// What is checked (and why):
//   • Node.js / npm          — the runtime and the package manager
//   • ffmpeg-static          — the bundled ffmpeg binary the render
//                              step actually spawns (NOT a system
//                              ffmpeg: the project never calls one)
//   • edge-tts (Python CLI)  — the TTS binary step 2 spawns
//   • Playwright Chromium    — the browser step 4 drives
//
// Every missing piece prints the exact command that fixes it.
// ──────────────────────────────────────────────────────────────

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const IS_WINDOWS = process.platform === "win32";
const WANT_INSTALL = process.argv.includes("--install");

// ── helpers ────────────────────────────────────────────────────

function parseVersion(v) {
  return String(v)
    .split(/[.-]/)
    .map((p) => parseInt(p, 10) || 0);
}

function gte(a, b) {
  const [av, bv] = [parseVersion(a), parseVersion(b)];
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const x = av[i] || 0;
    const y = bv[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return true;
}

function run(bin, args) {
  return execFileSync(bin, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
}

function which(bin) {
  try {
    const finder = IS_WINDOWS ? "where" : "which";
    const out = run(finder, [bin]);
    const first = out.split(/\r?\n/).find((l) => l.trim());
    return first ? first.trim() : null;
  } catch {
    return null;
  }
}

// Run a binary and report what happened. Never throws.
function probe(bin, args) {
  try {
    return { ok: true, out: run(bin, args).trim() };
  } catch (err) {
    return { ok: false, err };
  }
}

const results = [];

function record(name, version, ok, hint) {
  results.push({ name, version, ok, hint });
  const mark = ok ? "✓" : "✗";
  const ver = version ? version.padEnd(22) : "NOT FOUND".padEnd(22);
  console.log(`${mark} ${name.padEnd(18)} ${ver}`);
}

// ── 1. Node.js ─────────────────────────────────────────────────
{
  const v = process.versions.node;
  record("Node.js", `v${v}`, gte(v, "20.0.0"), "→ Install Node.js 20 or newer: https://nodejs.org");
}

// ── 2. npm ─────────────────────────────────────────────────────
{
  try {
    const v = run("npm", ["-v"]).trim();
    record("npm", v, gte(v, "9.0.0"), "→ Update npm: npm install -g npm");
  } catch {
    record(
      "npm",
      null,
      false,
      "→ Install npm: https://docs.npmjs.com/downloading-and-installing-node-js"
    );
  }
}

// ── 3. ffmpeg-static (the bundled binary the renderer uses) ───
{
  let binary = null;
  try {
    // ffmpeg-static exports the absolute path of the bundled binary.
    const mod = require("ffmpeg-static");
    binary = mod && typeof mod === "string" ? mod : null;
  } catch {
    binary = null;
  }
  if (binary && existsSync(binary)) {
    try {
      const out = run(binary, ["-version"]);
      const m = out.match(/ffmpeg version (\S+)/);
      record("ffmpeg-static", m ? m[1] : "installed", true, null);
    } catch {
      record("ffmpeg-static", "unrunnable", false, "→ Reinstall the dependency: npm install");
    }
  } else {
    record(
      "ffmpeg-static",
      null,
      false,
      "→ npm install   (the bundled ffmpeg binary lives in node_modules)"
    );
  }
}

// ── 4. edge-tts (Python CLI, spawned by step 2) ───────────────
{
  // Run it: that is the only reliable probe. `which` is used for
  // the hint only — it is not present on every Windows setup.
  const res = probe("edge-tts", ["--version"]);
  if (res.ok) {
    const version = res.out.split(/\r?\n/)[0] || "installed";
    record("edge-tts", version, true, null);
  } else {
    const where = which("edge-tts");
    record(
      "edge-tts",
      null,
      false,
      where
        ? `→ pip install edge-tts   (found at ${where} but it failed to run)`
        : "→ pip install edge-tts   (or: pipx install edge-tts)"
    );
  }
}

// ── 5. Playwright Chromium (the browser step 4 drives) ────────
function chromiumState() {
  try {
    const { chromium } = require("playwright");
    const exe = chromium.executablePath();
    return { ok: existsSync(exe), exe };
  } catch {
    return { ok: false, exe: null };
  }
}
{
  let state = chromiumState();
  if (!state.ok && WANT_INSTALL) {
    console.log("");
    console.log("→ Installing Playwright Chromium (~150 MB, one time) …");
    try {
      // The `playwright` package ships its CLI as `cli.js` next to
      // package.json (the `exports` map does not expose it).
      const pkgPath = require.resolve("playwright/package.json");
      const cliPath = path.join(path.dirname(pkgPath), "cli.js");
      run(process.execPath, [cliPath, "install", "chromium"]);
    } catch (err) {
      console.log(`  ✗ install failed: ${err.message}`);
    }
    state = chromiumState();
  }
  record(
    "Playwright Chromium",
    state.ok ? "installed" : null,
    state.ok,
    "→ npm run setup   (or: npx playwright install chromium)"
  );
}

// ── summary ────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);

console.log("");
if (failed.length === 0) {
  console.log("🎉 All dependencies OK. Run `npm start` to launch the server.");
  process.exit(0);
}

console.log("⚠️  Missing dependencies — how to fix them:");
for (const r of failed) {
  console.log(`   ${r.name}: ${r.hint}`);
}
console.log("");
console.log("Everything except edge-tts is optional for a first run:");
console.log("without edge-tts the TTS step emits silent audio and the");
console.log("video still renders (a `tts_failed:scene-N` warning is");
console.log("reported in the SSE `complete` event).");
process.exit(1);
