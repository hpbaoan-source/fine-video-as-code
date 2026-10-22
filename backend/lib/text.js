// ──────────────────────────────────────────────────────────────
// Shared text helpers — pure functions, no I/O.
//
// Used by the script normaliser (design-system.js), step 1
// (script generation) and step 4 (rendering) so the same rules
// apply everywhere a string ends up on screen.
// ──────────────────────────────────────────────────────────────

// Trim to `max` characters without cutting a word in half.
// Returns the original string when it already fits.
export function truncate(text, max, suffix = "…") {
  const s = String(text ?? "").trim();
  if (!s) return "";
  if (s.length <= max) return s;
  const cut = s.slice(0, Math.max(0, max - suffix.length));
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}${suffix}`;
}

// Collapse whitespace (including the newlines an LLM likes to
// sprinkle) into single spaces.
export function squish(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

// Fallback title when a scene has no explicit `heading`.
// Prefer the first complete sentence, capped at 8 words — a flat
// word slice cuts sentences in half and reads like broken copy.
export function deriveHeading(voiceover, language = "vi") {
  const s = squish(voiceover);
  if (!s) return "";
  // Vietnamese sentences often run on without a full stop, so the
  // first clause is a better title than the first sentence.
  const firstChunk =
    language === "vi"
      ? s.split(/(?<=[.!?])\s+|,\s+/)[0] || s
      : s.split(/(?<=[.!?])\s+/)[0] || s;
  const cleaned = firstChunk.replace(/[?.,!]+$/g, "").trim();
  const words = cleaned.split(/\s+/);
  if (words.length <= 8) return words.join(" ");
  return truncate(words.slice(0, 8).join(" "), 48, "").replace(/[,;:]$/, "");
}

// Short label derived from the voiceover — used for the caption
// line when a scene does not declare `visual_cue`.
export function deriveCueLabel(voiceover, language = "vi") {
  const s = squish(voiceover);
  if (!s) return "";
  const words = s.split(/\s+/).slice(0, language === "vi" ? 6 : 8).join(" ");
  return truncate(words, 60);
}

// Word count (whitespace separated).
export function wordCount(text) {
  const s = squish(text);
  return s ? s.split(/\s+/).length : 0;
}

// Estimated TTS duration in ms.
// Vietnamese TTS runs ~900-1000 characters per minute at natural
// pace; English is ~150-160 words per minute. These are estimates
// only — step 2 measures the real MP3 length with ffmpeg and
// overwrites `duration_ms`.
export function estimateDurationMs(text, language = "vi") {
  const CHARS_PER_MINUTE_VI = 950;
  const WPM_EN = 155;
  const s = squish(text);
  if (!s) return 0;
  if (language === "vi") {
    return Math.round((s.length / CHARS_PER_MINUTE_VI) * 60 * 1000);
  }
  return Math.round((wordCount(s) / WPM_EN) * 60 * 1000);
}

// Split a code snippet into lines and cap both count and width.
export function capCodeSnippet(code, maxLines = 8, maxLineChars = 120) {
  const lines = String(code ?? "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((l, i, arr) => !(l.trim() === "" && i === arr.length - 1));
  return lines
    .slice(0, maxLines)
    .map((l) => truncate(l, maxLineChars))
    .join("\n");
}

// ─── Vietnamese technical acronym phonetics for Edge-TTS ──────
// Acronyms in Vietnamese tech/business narration sound best when
// spelled out with phonetic approximations so Edge-TTS pronounces
// them clearly rather than mangling them.
export const VIETNAMESE_ACRONYMS = [
  // Multi-word acronyms first (longest match)
  [/\bVNPT[- ]?IT\b/gi, "vi en bi ti ai ti"],
  [/\bVNPT\b/gi, "vi en bi ti"],
  [/\bVGS\b/g, "vi gi ét"],
  [/\bPM\b/g, "bi em"],
  [/\bDBA\b/g, "đi bi ê"],
  [/\bJD\b/g, "dây đi"],
  [/\bCV\b/g, "xi vi"],
  [/\bSA\b/g, "ét ê"],
  [/\beOffice\b/gi, "e óp phít"],
  [/\bIT\b/g, "ai ti"],
  [/\bAI\b/g, "ây ai"],
  [/\bUI\b/g, "u ai"],
  [/\bUX\b/g, "u ích"],
  [/\bCEO\b/g, "xi i ô"],
  [/\bCTO\b/g, "xi ti ô"],
  [/\bHR\b/g, "hắt a"],
  [/\bERP\b/g, "i a pi"],
  [/\bAPI\b/g, "ây pi ai"],
  [/\bDevOps\b/gi, "đép óp"],
  [/\bQA\b/g, "kiu ê"],
  [/\bQC\b/g, "kiu xi"],
];

/**
 * Expand English technical acronyms into Vietnamese-friendly phonetic
 * approximations for Edge-TTS speech generation.
 */
export function expandVietnameseAcronyms(text) {
  let s = String(text ?? "");
  for (const [re, rep] of VIETNAMESE_ACRONYMS) {
    s = s.replace(re, rep);
  }
  return s;
}
