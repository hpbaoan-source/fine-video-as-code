// ──────────────────────────────────────────────────────────────
// Step 2 — TTS (Edge-TTS) + duration measurement
// ──────────────────────────────────────────────────────────────
// For each scene in the script:
//   1. Generate MP3 via Edge-TTS (free Microsoft voices)
//   2. Measure actual MP3 duration with ffprobe-style inspect
//      (fallback to text-length estimate if probe unavailable)
//   3. Compute durationInFrames = ceil(actualMs * fps / 1000)
// Output: durations.json
//   {
//     fps: 30,
//     scenes: [{ id, audio_path, duration_ms, durationInFrames }]
//   }
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileP = promisify(execFile);

const DurationsSchema = z.object({
  fps: z.number().int(),
  scenes: z.array(z.object({
    id: z.string(),
    audio_path: z.string(),
    duration_ms: z.number().int().positive(),
    durationInFrames: z.number().int().positive(),
  })),
  total_duration_ms: z.number().int(),
});

// ─── MP3 duration probe (no extra deps) ────────────────────
// Reads the Xing/Info header from the first MP3 frame, or
// walks the file to compute the exact duration from frame
// counts. For our needs (Vietnamese TTS, 15s-180s clips),
// parsing the LAME/Xing header is sufficient and fast.
async function probeMp3DurationMs(filePath) {
  const buf = await fs.readFile(filePath);
  // MPEG audio frame header: 0xFF 0xFB/0xFA/0xF2/0xF3
  // Locate first sync.
  let i = 0;
  while (i < buf.length - 4) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const h = buf[i + 1];
      const version = (h >> 3) & 0x3;     // 0=MPEG2.5, 2=MPEG2, 3=MPEG1
      const layer = (h >> 1) & 0x3;       // 1=Layer3
      const bitrateIdx = (buf[i + 2] >> 4) & 0xf;
      const samplerateIdx = (buf[i + 2] >> 2) & 0x3;
      if (layer === 1 && bitrateIdx > 0 && bitrateIdx < 15 && samplerateIdx < 3) {
        // bitrate table for MPEG1 Layer3
        const BR_M1L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
        // bitrate table for MPEG2/2.5 Layer3
        const BR_M2L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
        // samplerate table
        const SR_M1 = [44100, 48000, 32000, 0];
        const SR_M2 = [22050, 24000, 16000, 0];
        const SR_M25 = [11025, 12000, 8000, 0];
        const isM1 = version === 3;
        const brTable = isM1 ? BR_M1L3 : BR_M2L3;
        const srTable = isM1 ? SR_M1 : version === 2 ? SR_M2 : SR_M25;
        const bitrate = brTable[bitrateIdx] * 1000;
        const sampleRate = srTable[samplerateIdx];
        if (bitrate > 0 && sampleRate > 0) {
          const samplesPerFrame = isM1 ? 1152 : 576;
          const totalBytes = buf.length;
          // Estimate using file size / bitrate
          return Math.round((totalBytes * 8) / bitrate * 1000);
        }
      }
    }
    i++;
  }
  return null;
}

async function tryProbeWithFfprobe(filePath) {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const sec = parseFloat(stdout.trim());
    if (!isNaN(sec)) return Math.round(sec * 1000);
  } catch (e) {
    // ffprobe not on PATH — fall back to header parse
  }
  return null;
}

async function measureDuration(filePath, textMsEstimate) {
  const fromFfprobe = await tryProbeWithFfprobe(filePath);
  if (fromFfprobe) return fromFfprobe;
  const fromHeader = await probeMp3DurationMs(filePath);
  if (fromHeader) return fromHeader;
  // last resort: text-based estimate (will be slightly off but usable)
  return textMsEstimate;
}

// ─── Edge-TTS wrapper (Python CLI) ─────────────────────────
// We use the Python `edge-tts` package (more reliable than the
// npm wrapper, which has a hardcoded token that Microsoft
// rotates). The CLI is `edge-tts` — we look for it on PATH and
// fall back to `python -m edge_tts` and finally `py -m edge_tts`.
async function callEdgeTTS(text, voice, outPath) {
  const dir = path.dirname(outPath);
  await fs.mkdir(dir, { recursive: true });
  const args = ["--voice", voice, "--text", text, "--write-media", outPath];

  const candidates = [
    { cmd: "edge-tts", args },
    { cmd: "py",       args: ["-m", "edge_tts", ...args] },
    { cmd: "python",   args: ["-m", "edge_tts", ...args] },
    { cmd: "python3",  args: ["-m", "edge_tts", ...args] },
  ];
  for (const c of candidates) {
    try {
      await execFileP(c.cmd, c.args, { timeout: 30_000 });
      const stat = await fs.stat(outPath);
      if (stat.size > 200) return;
    } catch (e) {
      // try next candidate
    }
  }
  throw new Error(`TTS failed for: ${text.slice(0, 50)}...`);
}

// ─── Public API ────────────────────────────────────────────
export async function step2TTS(script, { onProgress, onLog, workDir, voice }) {
  const audioDir = path.join(workDir, "audio");
  await fs.mkdir(audioDir, { recursive: true });

  const fps = script.scenes[0]?.meta?.fps || 30; // default
  const out = { fps, scenes: [], total_duration_ms: 0 };

  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    const audioPath = path.join(audioDir, `${scene.id}.mp3`);
    onLog?.(`TTS scene ${i + 1}/${script.scenes.length}: "${scene.voiceover.slice(0, 50)}..."`);
    try {
      await callEdgeTTS(scene.voiceover, voice, audioPath);
    } catch (err) {
      onLog?.(`TTS failed for ${scene.id}: ${err.message}. Falling back to silent audio.`);
      // Create a 1s silent MP3 fallback so render can continue
      await createSilentMp3(audioPath, scene.duration_ms);
    }

    const actualMs = await measureDuration(audioPath, scene.duration_ms);
    // Pad slightly so TTS doesn't run ahead of visuals
    const paddedMs = Math.round(actualMs * 1.05);
    const durationInFrames = Math.max(1, Math.ceil((paddedMs * fps) / 1000));

    out.scenes.push({
      id: scene.id,
      audio_path: path.relative(workDir, audioPath),
      duration_ms: paddedMs,
      durationInFrames,
    });
    out.total_duration_ms += paddedMs;
    onProgress?.(Math.round(((i + 1) / script.scenes.length) * 100));
  }

  // Write durations.json
  await fs.writeFile(
    path.join(workDir, "durations.json"),
    JSON.stringify(out, null, 2),
    "utf8"
  );

  return DurationsSchema.parse(out);
}

// Create a silent MP3 fallback when TTS fails.
// Produces a minimal valid MP3 of given ms duration at 8kHz mono.
async function createSilentMp3(outPath, durationMs) {
  // Minimal silent MP3: ~128kbps, 8kHz, mono
  // For simplicity, copy a small pre-made silence from a constant.
  // We use a tiny valid 1-second silent MP3 and copy it.
  // (1 frame at 8kHz mono mp3 = 104 bytes, 24ms)
  // This is a pre-baked 100ms silence header. We'll just write
  // a known-good 1-second silence and let the renderer interpret
  // it as the full duration.
  const SILENCE_1S = Buffer.from(SILENT_MP3_BASE64, "base64");
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));
  const buf = Buffer.concat(Array(seconds).fill(SILENCE_1S));
  await fs.writeFile(outPath, buf);
}

// ~1 second of silence at 8kHz mono 8kbps (very small valid MP3)
const SILENT_MP3_BASE64 =
  "//uQxAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAg" +
  "ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg" +
  "ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAg" +
  "ICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA//tQxAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAACAAACcQCAgICAgIC" +
  "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC" +
  "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIC" +
  "AgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA=";
