// Integration test: parse an existing MP4 with ffmpeg and verify
// the audio and video streams are within ±0.1s of each other.
// This is the regression test for B1-B3 — every shipped sample
// must pass. Skip when the binary is missing or no sample is
// available (CI on a fresh checkout).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import ffmpegStatic from "ffmpeg-static";

const execFileP = promisify(execFile);

async function probeStreamDuration(file, streamSpecifier) {
  // Use ffmpeg -i <file> -map <stream> -f null - to get the exact
  // duration of one stream. The last `time=` line in stderr is the
  // total elapsed time, which for a single-stream pass equals that
  // stream's duration.
  const args = ["-hide_banner", "-i", file, "-map", streamSpecifier, "-f", "null", "-"];
  const { stderr } = await execFileP(ffmpegStatic, args, {
    maxBuffer: 5 * 1024 * 1024,
    windowsHide: true,
  });
  const lines = stderr.split("\n");
  let lastSec = null;
  for (const line of lines) {
    const m = line.match(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
    if (m) {
      lastSec =
        Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
  }
  return lastSec;
}

async function probeDurations(file) {
  const video = await probeStreamDuration(file, "0:v:0");
  const audio = await probeStreamDuration(file, "0:a:0");
  return { video, audio };
}

test("sample MP4: audio duration matches video duration within ±0.1s", async (t) => {
  if (!ffmpegStatic) {
    t.skip("ffmpeg-static not installed");
    return;
  }
  const here = dirname(fileURLToPath(import.meta.url));
  const sampleDir = path.join(here, "..", "..", "samples");
  let entries = [];
  try {
    entries = await fs.readdir(sampleDir);
  } catch {
    t.skip("no samples directory");
    return;
  }
  const mp4s = [];
  for (const entry of entries) {
    const p = path.join(sampleDir, entry, "video.mp4");
    try {
      await fs.stat(p);
      mp4s.push({ name: entry, path: p });
    } catch {
      /* skip — no MP4 in this folder */
    }
  }
  if (mp4s.length === 0) {
    t.skip("no sample MP4s found");
    return;
  }
  for (const { name, path: p } of mp4s) {
    const { video, audio } = await probeDurations(p);
    if (video === null) {
      t.skip(`${name}: no video stream detected`);
      continue;
    }
    if (audio === null) {
      t.skip(`${name}: no audio stream detected`);
      continue;
    }
    const drift = Math.abs(video - audio);
    assert.ok(
      drift <= 0.1,
      `${name}: audio/video drift = ${drift.toFixed(3)}s (video=${video.toFixed(3)}s, audio=${audio.toFixed(3)}s) — exceeds 0.1s`
    );
  }
});
