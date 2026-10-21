// ──────────────────────────────────────────────────────────────
// Step 2 — Text-to-speech (edge-tts) + audio prep
// ──────────────────────────────────────────────────────────────
// For each scene:
//   1. Generate an MP3 via edge-tts (or pick a candidate voice).
//   2. Probe the actual MP3 duration with ffmpeg -f null -.
//   3. Optionally pad to scene.target_duration_ms (estimate from
//      step 1) using -af apad -t <sec>.
//   4. Overwrite scene.duration_ms with the actual measured length
//      so step 4 (render) uses the same number for both video
//      timing and audio concat — guaranteeing sync.
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { validateVoice } from "../lib/voice.js";

const execFileP = promisify(execFile);
const FFMPEG_BIN = ffmpegStatic;
const FFMPEG_OPTS = { maxBuffer: 5 * 1024 * 1024, windowsHide: true };
// Shortest clip we are willing to produce (mirrors SceneSchema).
const MIN_SCENE_MS = 500;

export async function step2TTS(script, { input, workDir, onLog, onProgress }) {
  const audioDir = path.join(workDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });
  const warnings = [];

  // Validate language + voice against the single shared helper
  // (lib/voice.js) — the API route uses the same check, so a
  // request can no longer be accepted here and rejected there.
  const voiceCheck = validateVoice(input.language, input.voice);
  if (!voiceCheck.ok) {
    throw new Error(voiceCheck.error);
  }
  const allowedVoices = voiceCheck.allowed || [];
  const candidates = [voiceCheck.voice, ...allowedVoices.filter((v) => v !== voiceCheck.voice)];

  const total = script.scenes.length;
  for (let i = 0; i < total; i++) {
    const scene = script.scenes[i];
    const outMp3 = path.join(audioDir, `${scene.id}.mp3`);
    const text = String(scene.voiceover || "").trim();
    const ttsStart = Date.now();
    let ttsOk = false;
    let lastErr = null;

    if (text) {
      // Try each voice candidate in order. Log the final error so a
      // single-voice outage doesn't look like a silent success.
      for (const voice of candidates) {
        try {
          // Use --text=<text> with `=` to prevent argparse from
          // interpreting a leading `-` in the text (e.g. "-5 độ C")
          // as a CLI option.
          await execFileP(
            "edge-tts",
            ["--voice", voice, "--text", text, "--write-media", outMp3],
            { ...FFMPEG_OPTS, windowsHide: true }
          );
          ttsOk = true;
          break;
        } catch (e) {
          lastErr = e;
        }
      }
    }

    if (!ttsOk) {
      const reason = text
        ? `edge-tts failed for all candidates: ${lastErr?.stderr?.toString().slice(0, 200) || lastErr?.message}`
        : "voiceover is empty";
      onLog?.(`[warn] ${scene.id}: ${reason} — falling back to silence`);
      warnings.push(`tts_failed:${scene.id}`);
      await createSilentMp3(outMp3, 1.0);
    } else {
      onLog?.(`[tts] ${scene.id} (${((Date.now() - ttsStart) / 1000).toFixed(1)}s)`);
    }

    // Probe the actual MP3 length. ffmpeg-static does NOT bundle
    // ffprobe, so use `ffmpeg -i file -f null -` and parse `time=`
    // from stderr.
    const actualMs = await probeMp3DurationMs(outMp3);
    if (!Number.isFinite(actualMs) || actualMs <= 0) {
      // The clip could not be measured. Writing a 1s silent file
      // and *keeping* the planned duration would leave the audio
      // 12s shorter than the video timeline — the video would be
      // truncated by `-shortest`. Instead we write a silent clip
      // that is exactly as long as the scene, so audio and video
      // stay in sync no matter what.
      const plannedMs = Math.max(MIN_SCENE_MS, Number(scene.duration_ms) || 0);
      onLog?.(
        `[warn] ${scene.id}: probe returned ${actualMs}ms — writing ${plannedMs}ms of silence`
      );
      warnings.push(`probe_failed:${scene.id}`);
      await createSilentMp3(outMp3, plannedMs / 1000);
      const silentMs = await probeMp3DurationMs(outMp3);
      scene.duration_ms =
        Number.isFinite(silentMs) && silentMs > 0 ? silentMs : plannedMs;
      onProgress?.(Math.round(((i + 1) / total) * 100));
      continue;
    }

    // If the TTS audio is shorter than the planned duration, pad
    // with silence up to that target. If it's longer, leave as-is
    // (rare; e.g. slow TTS pace). This keeps total video length
    // predictable while preserving naturalness.
    const targetMs = scene.duration_ms || 0;
    if (targetMs > actualMs + 50) {
      const padSec = targetMs / 1000;
      await padMp3ToDuration(outMp3, padSec);
      const paddedMs = await probeMp3DurationMs(outMp3);
      scene.duration_ms = paddedMs;
    } else {
      scene.duration_ms = actualMs;
    }

    onProgress?.(Math.round(((i + 1) / total) * 100));
  }

  return { audioDir, warnings };
}

// Run `ffmpeg -i <file> -f null -` and parse the last `time=HH:MM:SS.MS`
// from stderr. Returns the duration in milliseconds.
export async function probeMp3DurationMs(file) {
  try {
    const { stderr } = await execFileP(
      FFMPEG_BIN,
      ["-hide_banner", "-i", file, "-f", "null", "-"],
      { ...FFMPEG_OPTS, windowsHide: true }
    );
    // `time=00:00:05.23` or `time=00:00:05.230000` (varies by ffmpeg version).
    const matches = [...stderr.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
    if (matches.length === 0) return NaN;
    const last = matches[matches.length - 1];
    const h = Number(last[1]);
    const m = Number(last[2]);
    const s = Number(last[3]);
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  } catch (e) {
    // execFile throws on non-zero exit. ffmpeg exits non-zero when
    // -f null is used (it has nowhere to write to), but stderr is
    // already captured. Fall through with NaN if no match.
    const stderr = e?.stderr ? e.stderr.toString() : "";
    const matches = [...stderr.matchAll(/time=(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/g)];
    if (matches.length === 0) return NaN;
    const last = matches[matches.length - 1];
    const h = Number(last[1]);
    const m = Number(last[2]);
    const s = Number(last[3]);
    return Math.round((h * 3600 + m * 60 + s) * 1000);
  }
}

// Pad an MP3 to exactly `targetSec` seconds. Re-encodes (LAME
// headers can shift when concatenating with `-c copy`, which is
// why step 4 uses `-c copy` only on pre-padded files).
// Writes to a sibling `.tmp.mp3` first, then atomically renames
// over the original — ffmpeg refuses to read and write the same
// file in one invocation.
export async function padMp3ToDuration(srcMp3, targetSec) {
  const tmpOut = srcMp3 + ".tmp.mp3";
  try {
    await execFileP(FFMPEG_BIN, padMp3Args(srcMp3, tmpOut, targetSec), FFMPEG_OPTS);
    await fs.rename(tmpOut, srcMp3);
  } finally {
    // Never leave a half-written *.tmp.mp3 behind.
    await fs.unlink(tmpOut).catch(() => {});
  }
}

// Pure function: build the ffmpeg argv for padMp3ToDuration.
// Exported separately so tests can assert on the exact args.
export function padMp3Args(srcMp3, outMp3, targetSec) {
  return [
    "-y", "-hide_banner", "-loglevel", "error", "-nostats",
    "-i", srcMp3,
    "-af", "apad",
    "-t", String(targetSec),
    "-c:a", "libmp3lame", "-b:a", "192k",
    outMp3,
  ];
}

// Generate a silent MP3 of `seconds` duration. Used when TTS
// fails. The previous implementation shipped an opaque base64
// blob whose validity was untested; this is a real MP3.
export async function createSilentMp3(outMp3, seconds) {
  await execFileP(FFMPEG_BIN, silentMp3Args(outMp3, seconds), FFMPEG_OPTS);
}

// Pure function: build the ffmpeg argv for createSilentMp3.
export function silentMp3Args(outMp3, seconds) {
  return [
    "-y", "-hide_banner", "-loglevel", "error", "-nostats",
    "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
    "-t", String(seconds),
    "-q:a", "9", "-acodec", "libmp3lame",
    outMp3,
  ];
}
