// Schema validation tests — pure, no I/O.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GenerateInputSchema,
  LanguageEnum,
  VisualCueSchema,
  SceneSchema,
  ScriptSchema,
  TemplateEnum,
} from "../lib/schema.js";

test("GenerateInputSchema accepts a minimal valid input", () => {
  const out = GenerateInputSchema.parse({
    topic: "How DNS works",
    template: "tech-explainer",
    voice: "vi-VN-HoaiMyNeural",
    duration: 60,
  });
  assert.equal(out.language, "vi");
  assert.equal(out.resolution, "1080p");
  assert.equal(out.brandColor, "#3B82F6");
});

test("outputFilename: rejects path traversal", () => {
  for (const bad of [
    "../../etc/passwd",
    "..\\..\\windows\\system32",
    "/abs/path/foo",
    "foo/bar.mp4",
    "foo;rm -rf",
  ]) {
    assert.throws(
      () => GenerateInputSchema.parse({
        topic: "x-topic-name",
        template: "tech-explainer",
        voice: "vi-VN-HoaiMyNeural",
        duration: 30,
        outputFilename: bad,
      }),
      /outputFilename|invalid/
    );
  }
});

test("outputFilename: accepts safe characters", () => {
  for (const ok of ["video", "my-video_v2", "How HTTPS Works", "01-test"]) {
    const out = GenerateInputSchema.parse({
      topic: "x-topic-name",
      template: "tech-explainer",
      voice: "vi-VN-HoaiMyNeural",
      duration: 30,
      outputFilename: ok,
    });
    assert.equal(out.outputFilename, ok);
  }
});

test("outputFilename: rejects too long (>80)", () => {
  const long = "a".repeat(81);
  assert.throws(() =>
    GenerateInputSchema.parse({
      topic: "x-topic-name",
      template: "tech-explainer",
      voice: "vi-VN-HoaiMyNeural",
      duration: 30,
      outputFilename: long,
    })
  );
});

test("brandColor: rejects non-#rrggbb hex", () => {
  assert.throws(() =>
    GenerateInputSchema.parse({
      topic: "x-topic-name",
      template: "tech-explainer",
      voice: "vi-VN-HoaiMyNeural",
      duration: 30,
      brandColor: "red",
    })
  );
  assert.throws(() =>
    GenerateInputSchema.parse({
      topic: "x-topic-name",
      template: "tech-explainer",
      voice: "vi-VN-HoaiMyNeural",
      duration: 30,
      brandColor: "FFB900", // missing #
    })
  );
});

test("duration: out of range", () => {
  assert.throws(() =>
    GenerateInputSchema.parse({
      topic: "x-topic-name",
      template: "tech-explainer",
      voice: "vi-VN-HoaiMyNeural",
      duration: 10, // < 15
    })
  );
  assert.throws(() =>
    GenerateInputSchema.parse({
      topic: "x-topic-name",
      template: "tech-explainer",
      voice: "vi-VN-HoaiMyNeural",
      duration: 600, // > 300
    })
  );
});

test("SceneSchema requires voiceover, duration_ms, id", () => {
  const good = SceneSchema.parse({
    id: "scene-1",
    voiceover: "Hello",
    duration_ms: 3000,
  });
  assert.equal(good.id, "scene-1");
  assert.deepEqual(good.visual_cues, []);
});

test("SceneSchema rejects duration_ms below 500 or above 30000", () => {
  assert.throws(() =>
    SceneSchema.parse({ id: "scene-1", voiceover: "x", duration_ms: 100 })
  );
  assert.throws(() =>
    SceneSchema.parse({ id: "scene-1", voiceover: "x", duration_ms: 60000 })
  );
});

test("ScriptSchema requires at least one scene", () => {
  assert.throws(() =>
    ScriptSchema.parse({
      template: "tech-explainer",
      language: "vi",
      total_duration_ms: 0,
      scenes: [],
    })
  );
});

test("TemplateEnum rejects unknown template", () => {
  assert.throws(() =>
    TemplateEnum.parse("react-tutorial")
  );
});

test("LanguageEnum rejects unknown language", () => {
  assert.throws(() => LanguageEnum.parse("jp"));
});

test("VisualCueSchema defaults position to center, animation to fade", () => {
  const v = VisualCueSchema.parse({ type: "icon", content: "lock" });
  assert.equal(v.position, "center");
  assert.equal(v.animation, "fade");
});
