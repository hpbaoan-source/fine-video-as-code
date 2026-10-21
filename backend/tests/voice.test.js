// Voice validation — one helper for the API route and step 2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVoice, VOICE_PRESETS } from "../lib/voice.js";

test("validateVoice: accepts a known voice for the language", () => {
  const result = validateVoice("vi", "vi-VN-HoaiMyNeural");
  assert.equal(result.ok, true);
  assert.equal(result.voice, "vi-VN-HoaiMyNeural");
  assert.equal(result.language, "vi");
});

test("validateVoice: rejects a voice from another language", () => {
  const result = validateVoice("vi", "en-US-AriaNeural");
  assert.equal(result.ok, false);
  assert.match(result.error, /Invalid voice/);
  assert.deepEqual(result.allowed, VOICE_PRESETS.vi);
  assert.equal(result.received, "en-US-AriaNeural");
});

test("validateVoice: rejects an unknown language", () => {
  const result = validateVoice("fr", "fr-FR-DeniseNeural");
  assert.equal(result.ok, false);
  assert.match(result.error, /Unsupported language/);
});

test("validateVoice: rejects an empty voice", () => {
  const result = validateVoice("en", "");
  assert.equal(result.ok, false);
});

test("VOICE_PRESETS: every language has at least one voice", () => {
  for (const [lang, voices] of Object.entries(VOICE_PRESETS)) {
    assert.ok(Array.isArray(voices) && voices.length > 0, `${lang} has no voices`);
  }
});
