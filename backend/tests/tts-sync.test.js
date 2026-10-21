// TTS → duration sync.
//
// When edge-tts fails (or the voiceover is empty) the pipeline
// falls back to silence. The silent clip must be exactly as long
// as the scene, otherwise the video timeline and the audio drift
// apart and `-shortest` truncates the video.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { step2TTS, probeMp3DurationMs } from "../workflow/step2-tts.js";

test("step2TTS: a failed TTS falls back to silence of the planned length", async (t) => {
  if (!ffmpegStatic) {
    t.skip("ffmpeg-static not installed");
    return;
  }
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "finevideo-tts-"));
  const plannedMs = 3000;
  const script = {
    template: "tech-explainer",
    language: "vi",
    total_duration_ms: plannedMs,
    scenes: [
      {
        id: "scene-1",
        // Empty voiceover → no TTS call, silent fallback.
        voiceover: "",
        duration_ms: plannedMs,
        visual_cues: [],
      },
    ],
  };

  try {
    const result = await step2TTS(script, {
      input: { language: "vi", voice: "vi-VN-HoaiMyNeural" },
      workDir,
      onLog: () => {},
      onProgress: () => {},
    });

    assert.ok(result.warnings.some((w) => w.startsWith("tts_failed:")), "expected a warning");

    const mp3 = path.join(result.audioDir, "scene-1.mp3");
    const actualMs = await probeMp3DurationMs(mp3);
    assert.ok(actualMs > 0, "the silent clip must be measurable");

    // The scene duration must match the audio — no drift.
    assert.equal(script.scenes[0].duration_ms, actualMs);
    assert.ok(
      Math.abs(actualMs - plannedMs) <= 250,
      `audio ${actualMs}ms drifted from the planned ${plannedMs}ms`
    );
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("step2TTS: rejects a voice that does not belong to the language", async () => {
  await assert.rejects(
    () =>
      step2TTS(
        { language: "vi", total_duration_ms: 1000, scenes: [] },
        { input: { language: "vi", voice: "en-US-AriaNeural" }, workDir: os.tmpdir() }
      ),
    /Invalid voice/
  );
});
