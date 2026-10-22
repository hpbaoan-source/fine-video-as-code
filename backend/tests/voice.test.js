// Voice validation — one helper for the API route and step 2.
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateVoice, VOICE_PRESETS } from "../lib/voice.js";
import { expandVietnameseAcronyms } from "../lib/text.js";

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

test("expandVietnameseAcronyms: expands common technical acronyms for Edge-TTS", () => {
  assert.equal(
    expandVietnameseAcronyms("kết nối cùng VNPT-IT ngay"),
    "kết nối cùng vi en bi ti ai ti ngay"
  );
  assert.equal(
    expandVietnameseAcronyms("kết nối cùng VNPT IT ngay"),
    "kết nối cùng vi en bi ti ai ti ngay"
  );
  assert.equal(expandVietnameseAcronyms("tập đoàn VNPT"), "tập đoàn vi en bi ti");
  assert.equal(expandVietnameseAcronyms("Chuyên viên Kinh doanh VGS"), "Chuyên viên Kinh doanh vi gi ét");
  assert.equal(expandVietnameseAcronyms("Quản lý dự án (PM)"), "Quản lý dự án (bi em)");
  assert.equal(expandVietnameseAcronyms("Quản trị cơ sở dữ liệu (DBA)"), "Quản trị cơ sở dữ liệu (đi bi ê)");
  assert.equal(expandVietnameseAcronyms("chi tiết JD và gửi CV qua eOffice"), "chi tiết dây đi và gửi xi vi qua e óp phít");
  assert.equal(expandVietnameseAcronyms("giao thức HTTPS và HTTP trên TLS/SSL"), "giao thức hắt tê tê pê ét và hắt tê tê pê trên ti en ét/ét ét en");
  assert.equal(expandVietnameseAcronyms("mở IDE kiểm tra CI/CD và tạo PR"), "mở ai đi i kiểm tra xi ai xi đi và tạo pi a");
});
