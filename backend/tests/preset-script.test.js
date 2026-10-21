// Step 1 — preset script path guard and duration distribution.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  step1Script,
  resolvePresetScript,
  distributeDurations,
  templateSceneCount,
  MAX_SCENE_DURATION_MS,
} from "../workflow/step1-script.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..", "..");

test("resolvePresetScript: rejects paths outside samples/", () => {
  assert.throws(() => resolvePresetScript("../../etc/passwd"), /samples/);
  assert.throws(() => resolvePresetScript("/etc/passwd"), /samples/);
  assert.throws(() => resolvePresetScript("samples/../../../etc/hosts"), /samples/);
  assert.throws(() => resolvePresetScript("package.json"), /samples/);
});

test("resolvePresetScript: rejects non-JSON files inside samples/", () => {
  assert.throws(() => resolvePresetScript("samples/README.md"), /\.json/);
});

test("resolvePresetScript: accepts a script.json inside samples/", () => {
  const fp = resolvePresetScript("samples/01-how-https-works/script.json");
  assert.equal(fp, path.join(REPO_ROOT, "samples", "01-how-https-works", "script.json"));
});

test("step1Script: a traversal attempt is rejected with a clear error", async () => {
  await assert.rejects(
    () =>
      step1Script(
        {
          topic: "Test",
          template: "tech-explainer",
          language: "vi",
          voice: "vi-VN-HoaiMyNeural",
          duration: 30,
          presetScript: "../../etc/passwd",
        },
        {}
      ),
    /samples/
  );
});

test("distributeDurations: spreads the target and clamps every scene", () => {
  const scenes = [
    { duration_ms: 10000 },
    { duration_ms: 10000 },
    { duration_ms: 10000 },
  ];
  const total = distributeDurations(scenes, 60000);
  assert.equal(total, 60000);
  assert.deepEqual(scenes.map((s) => s.duration_ms), [20000, 20000, 20000]);
});

test("distributeDurations: never exceeds the 30s schema limit", () => {
  const scenes = [{ duration_ms: 1000 }, { duration_ms: 1000 }];
  const total = distributeDurations(scenes, 200000);
  for (const s of scenes) {
    assert.ok(s.duration_ms <= MAX_SCENE_DURATION_MS, `${s.duration_ms} > 30000`);
    assert.ok(s.duration_ms >= 500, `${s.duration_ms} < 500`);
  }
  assert.equal(total, scenes.reduce((a, s) => a + s.duration_ms, 0));
});

test("distributeDurations: the last scene is never negative", () => {
  const scenes = [{ duration_ms: 1 }, { duration_ms: 1 }, { duration_ms: 1 }];
  distributeDurations(scenes, 1000);
  for (const s of scenes) assert.ok(s.duration_ms >= 500);
});

test("templateSceneCount: returns the number of scenes per template", () => {
  assert.equal(templateSceneCount("tech-explainer"), 6);
  assert.equal(templateSceneCount("promo"), 5);
  assert.equal(templateSceneCount("tutorial"), 7);
  // Aliases resolve onto the canonical template.
  assert.equal(templateSceneCount("ad"), 5);
});

test("step1Script: a long request produces a valid script (no Zod error)", async () => {
  const script = await step1Script(
    {
      topic: "Test",
      template: "tech-explainer",
      language: "vi",
      voice: "vi-VN-HoaiMyNeural",
      duration: 180, // 6 scenes × 30s
    },
    {}
  );
  for (const s of script.scenes) {
    assert.ok(s.duration_ms <= MAX_SCENE_DURATION_MS);
    assert.ok(s.duration_ms >= 500);
  }
  const sum = script.scenes.reduce((a, s) => a + s.duration_ms, 0);
  assert.equal(script.total_duration_ms, sum);
});

test("step1Script: the topic cue is added to the last scene, not just the first", async () => {
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
  const last = script.scenes[script.scenes.length - 1];
  assert.ok(
    last.visual_cues.some((c) => c.position === "top"),
    "the last scene should carry the topic cue"
  );
});
