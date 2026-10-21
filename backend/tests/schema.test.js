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

test("SceneSchema accepts all enrichment fields", () => {
  const s = SceneSchema.parse({
    id: "scene-1",
    voiceover: "x",
    duration_ms: 3000,
    badge: "STEP 01 · HTTPS",
    subheading: "Bảo mật là điều kiện tiên quyết",
    bullets: ["Mã hoá đầu cuối", "Chứng chỉ số", "TLS 1.3"],
    metrics: [
      { value: "256-bit", label: "AES" },
      { value: "1.3", label: "TLS VERSION" },
    ],
    codeSnippet: "$ curl https://example.com\n✓ Connection secure",
    diagram: {
      nodes: ["Client", "TLS Handshake", "Server"],
      steps: ["Negotiate", "Verify cert", "Exchange keys"],
    },
  });
  assert.equal(s.badge, "STEP 01 · HTTPS");
  assert.equal(s.bullets.length, 3);
  assert.equal(s.metrics.length, 2);
  assert.equal(s.diagram.nodes.length, 3);
});

test("SceneSchema rejects bullet string over 200 chars", () => {
  assert.throws(() =>
    SceneSchema.parse({
      id: "scene-1",
      voiceover: "x",
      duration_ms: 3000,
      bullets: ["a".repeat(201)],
    })
  );
});

test("SceneSchema rejects more than 8 bullets", () => {
  assert.throws(() =>
    SceneSchema.parse({
      id: "scene-1",
      voiceover: "x",
      duration_ms: 3000,
      bullets: Array.from({ length: 9 }, (_, i) => `b${i}`),
    })
  );
});

test("SceneSchema rejects more than 4 metrics", () => {
  assert.throws(() =>
    SceneSchema.parse({
      id: "scene-1",
      voiceover: "x",
      duration_ms: 3000,
      metrics: Array.from({ length: 5 }, (_, i) => ({ value: `v${i}`, label: `l${i}` })),
    })
  );
});

test("SceneSchema without enrichment fields still validates", () => {
  const s = SceneSchema.parse({
    id: "scene-1",
    voiceover: "x",
    duration_ms: 3000,
  });
  assert.equal(s.bullets, undefined);
  assert.equal(s.metrics, undefined);
  assert.equal(s.badge, undefined);
});
test("fontFamily: only whitelisted fonts are accepted", () => {
  const base = {
    topic: "x-topic-name",
    template: "tech-explainer",
    voice: "vi-VN-HoaiMyNeural",
    duration: 30,
  };
  // A free-form font string used to be interpolated straight into
  // `body { font-family }` — a CSS injection vector.
  assert.throws(
    () => GenerateInputSchema.parse({ ...base, fontFamily: "Inter; background:url(javascript:1)" }),
    /fontFamily|invalid/i
  );
  assert.throws(() => GenerateInputSchema.parse({ ...base, fontFamily: "Comic Sans" }), /fontFamily|invalid/i);
  for (const ok of ["Inter", "Georgia", "system-ui", "Roboto Slab", "JetBrains Mono", "serif"]) {
    assert.equal(GenerateInputSchema.parse({ ...base, fontFamily: ok }).fontFamily, ok);
  }
});

test("removed fields are stripped instead of breaking the request", () => {
  // The old form sent `backgroundMusic` / `aiModel` — both were
  // never implemented. Zod drops unknown keys, so an old client
  // keeps working instead of getting a 400.
  const out = GenerateInputSchema.parse({
    topic: "x-topic-name",
    template: "tech-explainer",
    voice: "vi-VN-HoaiMyNeural",
    duration: 30,
    backgroundMusic: true,
    aiModel: "gpt-4o",
  });
  assert.equal(out.backgroundMusic, undefined);
  assert.equal(out.aiModel, undefined);
});

test("maxScenes: out of range is rejected, in range is kept", () => {
  const base = {
    topic: "x-topic-name",
    template: "tech-explainer",
    voice: "vi-VN-HoaiMyNeural",
    duration: 30,
  };
  assert.throws(() => GenerateInputSchema.parse({ ...base, maxScenes: 1 }));
  assert.throws(() => GenerateInputSchema.parse({ ...base, maxScenes: 21 }));
  assert.equal(GenerateInputSchema.parse({ ...base, maxScenes: 3 }).maxScenes, 3);
  assert.equal(GenerateInputSchema.parse(base).maxScenes, 6);
});

test("deterministic is optional and defaults to undefined", () => {
  const base = {
    topic: "x-topic-name",
    template: "tech-explainer",
    voice: "vi-VN-HoaiMyNeural",
    duration: 30,
  };
  assert.equal(GenerateInputSchema.parse(base).deterministic, undefined);
  assert.equal(GenerateInputSchema.parse({ ...base, deterministic: false }).deterministic, false);
  assert.equal(GenerateInputSchema.parse({ ...base, deterministic: true }).deterministic, true);
});
