// Determinism test — proves Phase E (deterministic render) is
// actually bit-for-bit reproducible. Renders the same tiny scene
// twice via step4Render, compares SHA-256 of the output MP4s.
//
// Skips gracefully when:
//   - Playwright Chromium is not installed
//   - ffmpeg-static is missing
//   - Either render fails
//
// Runtime: ~10–15s on a typical laptop (2 renders × 3s video
// each, 30fps = 90 frames per render). Pass the test by hash, not
// by size — same input should produce same bytes.
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { step4Render } from "../workflow/step4-render.js";

const execFileP = promisify(execFile);

async function sha256File(file) {
  const buf = await fs.readFile(file);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function playwrightAvailable() {
  // Cheap probe: try to launch Chromium. If the binary is missing,
  // the launch promise rejects with a clear error.
  try {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch (err) {
    return false;
  }
}

async function writeSilentMp3(outPath, durationSec) {
  // Same shape step 2 produces for a TTS fallback: 24kHz mono MP3.
  await execFileP(
    ffmpegStatic,
    [
      "-y", "-hide_banner", "-loglevel", "error", "-nostats",
      "-f", "lavfi", "-i", `anullsrc=r=24000:cl=mono`,
      "-t", String(durationSec),
      "-q:a", "9", "-acodec", "libmp3lame",
      outPath,
    ],
    { maxBuffer: 5 * 1024 * 1024, windowsHide: true }
  );
}

test("deterministic render: same input → same MP4 bytes (SHA-256 match)", async (t) => {
  if (!ffmpegStatic) {
    t.skip("ffmpeg-static not installed");
    return;
  }
  if (!(await playwrightAvailable())) {
    t.skip("Playwright Chromium not installed (run `npx playwright install chromium`)");
    return;
  }

  // Two scenes, 1.5s each, total 3s. At 30 fps that's 90 frames
  // per render — fast enough to run twice in CI.
  const scene1 = { id: "scene-1", heading: "First",  voiceover: "Hello",  duration_ms: 1500 };
  const scene2 = { id: "scene-2", heading: "Second", voiceover: "World",  duration_ms: 1500 };
  const script = { scenes: [scene1, scene2] };
  const input = {
    template: "tech-explainer",
    topic: "Determinism test",
    language: "en",
    voice: "en-US-AriaNeural",
    deterministic: true,
    fps: 30,
  };

  // Two independent workdirs — no shared state.
  const workDir1 = await fs.mkdtemp(path.join(os.tmpdir(), "finevideo-det-a-"));
  const workDir2 = await fs.mkdtemp(path.join(os.tmpdir(), "finevideo-det-b-"));

  // Each workdir needs scene audio files at the path step4Render
  // expects (workdir/audio/${id}.mp3). Use silent MP3s so the
  // test doesn't depend on edge-tts being installed.
  for (const dir of [workDir1, workDir2]) {
    await fs.mkdir(path.join(dir, "audio"), { recursive: true });
    await writeSilentMp3(path.join(dir, "audio", "scene-1.mp3"), 1.5);
    await writeSilentMp3(path.join(dir, "audio", "scene-2.mp3"), 1.5);
  }

  const logs1 = [];
  const logs2 = [];
  try {
    const result1 = await step4Render({
      script, input, workDir: workDir1,
      onLog: (msg) => logs1.push(msg),
      onProgress: () => {},
    });
    const result2 = await step4Render({
      script, input, workDir: workDir2,
      onLog: (msg) => logs2.push(msg),
      onProgress: () => {},
    });

    assert.ok(fsSync.existsSync(result1.path), "render 1 produced no MP4");
    assert.ok(fsSync.existsSync(result2.path), "render 2 produced no MP4");

    const hash1 = await sha256File(result1.path);
    const hash2 = await sha256File(result2.path);

    assert.equal(
      hash1, hash2,
      `deterministic render produced different bytes\n` +
      `  render1: ${hash1} (${result1.path})\n` +
      `  render2: ${hash2} (${result2.path})\n` +
      `  size1: ${result1.size} bytes, size2: ${result2.size} bytes\n` +
      `  — log1 tail: ${logs1.slice(-3).join(" | ")}\n` +
      `  — log2 tail: ${logs2.slice(-3).join(" | ")}`
    );

    t.diagnostic(`both renders: SHA-256 = ${hash1} (${(result1.size / 1024).toFixed(1)} KB)`);
  } finally {
    // Clean up temp dirs (best-effort; on Windows, ignore EBUSY).
    for (const dir of [workDir1, workDir2]) {
      try { await fs.rm(dir, { recursive: true, force: true }); } catch {}
    }
  }
});
