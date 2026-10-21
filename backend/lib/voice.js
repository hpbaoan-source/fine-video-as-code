// ──────────────────────────────────────────────────────────────
// Voice validation — single source of truth.
//
// The API route (routes/generate.js) and the TTS step
// (workflow/step2-tts.js) used to check the voice against two
// different lists, so a request could be accepted by the API and
// then rejected half-way through the workflow. Both now call
// `validateVoice()` below.
//
// NOTE: `lib/schema.js` owns the `VoicePresets` map — this module
// only re-exports it under a friendlier name and adds the
// validation. Keep the two in sync: the list below is the one the
// API and the TTS step agree on.
// ──────────────────────────────────────────────────────────────

import { VoicePresets } from "./schema.js";

// Canonical list of voices, keyed by language.
export const VOICE_PRESETS = {
  vi: [...(VoicePresets.vi || [])],
  en: [...(VoicePresets.en || [])],
};

// Languages the pipeline can synthesize.
export const SUPPORTED_LANGUAGES = Object.keys(VOICE_PRESETS);

/**
 * Validate a (language, voice) pair.
 * Returns `{ ok: true, voice, language }` or
 * `{ ok: false, error, language, allowed, received }`.
 */
export function validateVoice(language, voice) {
  const lang = String(language ?? "");
  const allowed = VOICE_PRESETS[lang];
  if (!allowed) {
    return {
      ok: false,
      error: `Unsupported language: "${language}". Use one of: ${SUPPORTED_LANGUAGES.join(", ")}.`,
      language: lang,
      allowed: [],
      received: voice ?? null,
    };
  }
  const received = String(voice ?? "");
  if (!allowed.includes(received)) {
    return {
      ok: false,
      error: `Invalid voice: "${received}". Pick one of: ${allowed.join(", ")}`,
      language: lang,
      allowed,
      received,
    };
  }
  return { ok: true, voice: received, language: lang, allowed };
}
