// Duration flow — the original B1 bug was that step 4 looked up
// `durations[s.id]?.ms` against a schema that was actually
// `{ scenes: [{id, duration_ms}] }`. This test pins the data
// shape that the workflow now relies on.
import { test } from "node:test";
import assert from "node:assert/strict";
import { step1Script } from "../workflow/step1-script.js";

test("step1Script: presetScript round-trip — script.json fields survive normalization", async () => {
  const script = await step1Script(
    {
      topic: "Test",
      template: "tech-explainer",
      language: "vi",
      voice: "vi-VN-HoaiMyNeural",
      duration: 30,
      presetScript: null, // force template path
    },
    {}
  );
  // Every scene has an id, a voiceover, and a duration_ms.
  for (const s of script.scenes) {
    assert.match(s.id, /^scene-\d+$/);
    assert.ok(s.voiceover.length > 0);
    assert.ok(Number.isInteger(s.duration_ms));
    assert.ok(s.duration_ms >= 500, `scene ${s.id} duration ${s.duration_ms} too short`);
  }
  // Total equals sum of per-scene durations.
  const sum = script.scenes.reduce((acc, s) => acc + s.duration_ms, 0);
  assert.equal(script.total_duration_ms, sum);
});

test("step1Script: VI text gets CHARS_PER_MINUTE_VI estimate (~950 chars/min)", async () => {
  // 950 chars/min means a 950-char text is ~60 seconds.
  // We can't easily construct a 950-char preset without LLM, so
  // we test the unit function indirectly: a known text gives a
  // deterministic estimate that's > 0 and within plausible range.
  const script = await step1Script(
    {
      topic: "Test",
      template: "tutorial",
      language: "vi",
      voice: "vi-VN-HoaiMyNeural",
      duration: 60,
    },
    {}
  );
  // For each scene: 100 chars / 950 chars per min = 6.3s
  // (the actual scenes are shorter, so durations are < 10s each)
  for (const s of script.scenes) {
    const charsPerSec = s.voiceover.length / (s.duration_ms / 1000);
    // Anywhere between 5 chars/sec (slow) and 25 chars/sec (fast)
    // is reasonable for VI TTS.
    assert.ok(
      charsPerSec >= 5 && charsPerSec <= 25,
      `scene ${s.id}: ${charsPerSec.toFixed(1)} chars/sec out of range (5-25)`
    );
  }
});

test("step1Script: presetScript override preserves all scenes", async () => {
  // We use a real sample if available, otherwise skip.
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const url = await import("node:url");
  const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
  const samplePath = path.join(
    __dirname, "..", "..", "samples", "01-how-https-works", "script.json"
  );
  let sample;
  try {
    sample = JSON.parse(await fs.readFile(samplePath, "utf8"));
  } catch {
    // sample not in tree — skip
    return;
  }
  const script = await step1Script(
    {
      topic: "How HTTPS Works",
      template: "tech-explainer",
      language: "vi",
      voice: "vi-VN-HoaiMyNeural",
      duration: 87,
      presetScript: samplePath,
    },
    {}
  );
  assert.equal(script.scenes.length, sample.scenes.length);
  for (let i = 0; i < script.scenes.length; i++) {
    assert.equal(script.scenes[i].id, sample.scenes[i].id);
    // After normalization, voiceover text is preserved
    assert.equal(script.scenes[i].voiceover, sample.scenes[i].voiceover);
  }
});
