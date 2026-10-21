// ──────────────────────────────────────────────────────────────
// Zod schemas — single source of truth for input/output validation
// ──────────────────────────────────────────────────────────────

import { z } from "zod";
import { normalizeTemplate } from "./design-system.js";

// ─── Templates ──────────────────────────────────────────────
//
// Accept the canonical names plus the aliases that appear in
// hand-written scripts ("top-list", "howto", "ad", …) and fold
// them onto the canonical template before validation.
export const TemplateEnum = z.preprocess(
  (value) => normalizeTemplate(value) ?? value,
  z.enum(["tech-explainer", "promo", "tutorial"])
);
export const LanguageEnum = z.enum(["vi", "en"]);
export const AspectEnum = z.enum(["16:9", "9:16", "1:1", "4:3"]);
export const ResolutionEnum = z.enum(["480p", "720p", "1080p", "1440p", "2160p"]);

// ─── Form input schema (POST /api/generate) ────────────────
export const GenerateInputSchema = z.object({
  topic: z.string().min(3, "topic must be at least 3 chars").max(500),
  template: TemplateEnum,
  language: LanguageEnum.default("vi"),
  voice: z.string().min(1).max(80), // validated against per-language whitelist in step2-tts.js
  duration: z.number().int().min(15).max(300), // seconds
  fps: z.number().int().min(15).max(60).default(30),
  resolution: ResolutionEnum.default("1080p"),
  aspectRatio: AspectEnum.default("16:9"),
  brandColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb")
    .default("#3B82F6"),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "must be #rrggbb")
    .default("#F59E0B"),
  fontFamily: z.string().min(1).max(80).default("Inter"),
  backgroundMusic: z.boolean().default(false),
  maxScenes: z.number().int().min(2).max(20).default(6),
  aiModel: z.string().default("default"),
  presetScript: z.string().min(1).max(500).optional(),
  outputFilename: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[\w\- ]{1,80}$/, "outputFilename may only contain letters, digits, underscore, hyphen, and spaces")
    .optional(),
});

// ─── Scene schema (Step 1 output) ──────────────────────────
export const VisualCueSchema = z.object({
  type: z.enum(["text", "icon", "chart", "shape", "code", "image", "terminal"]),
  // Most cue types need `content`; icon/image cues may use `name`
  // (a key into the Phosphor or custom illustration registry).
  // `content` is auto-derived from `name` when missing.
  content: z.string().optional(),
  name: z.string().optional(),
  // Visual customization (icons + images only).
  size: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  // Chart: { type: "chart", data: { Plan: 1, Pro: 4, Team: 12 } }
  // or fallback parser splits `content` on ; and :
  data: z.record(z.string(), z.number()).optional(),
  position: z.enum(["center", "left", "right", "top", "bottom"]).default("center"),
  animation: z
    .enum(["fade", "slide-up", "slide-left", "zoom", "none"])
    .default("fade"),
});

export const SceneSchema = z.object({
  id: z.string().regex(/^scene-\d+$/),
  voiceover: z.string().min(1),
  duration_ms: z.number().int().min(500).max(30000), // initial estimate
  visual_cues: z.array(VisualCueSchema).default([]),
  on_screen_text: z.string().optional(),
  // Big card title. Without this field Zod strips it from every
  // script and the templates fall back to a 6-word slice of the
  // voiceover, which reads like a broken sentence.
  heading: z.string().max(200).optional(),
  // Short caption describing what the viewer is looking at
  // ("ổ khóa trên URL", "sơ đồ TLS handshake"). Rendered as a
  // caption chip under the heading.
  visual_cue: z.string().max(120).optional(),
  // Layout variant for the scene: title | split | stack.
  // When omitted the design-system middleware picks one.
  layout: z.enum(["title", "split", "stack"]).optional(),

  // ─── Enrichment fields (all optional, all rendered via the
  // shared _engine.js helpers so templates pick them up
  // automatically when present) ────────────────────────────────
  // Pill above heading: e.g. "STEP 01 · GIT MASTERY".
  badge: z.string().max(120).optional(),
  // Smaller accent text under heading.
  subheading: z.string().max(200).optional(),
  // Ordered list, animate in with stagger 0.18s.
  bullets: z.array(z.string().max(200)).max(8).optional(),
  // 1–4 stat cards: { value, label? }.
  metrics: z
    .array(z.object({ value: z.string().max(40), label: z.string().max(80).optional() }))
    .max(4)
    .optional(),
  // Inline code block (terminal-card style).
  codeSnippet: z.string().max(2000).optional(),
  // Two arrays: nodes (drawn as pills with arrow connectors) and
  // steps (a sequenced list under the diagram).
  diagram: z
    .object({
      nodes: z.array(z.string().max(60)).max(6).optional(),
      steps: z.array(z.string().max(120)).max(6).optional(),
    })
    .optional(),
});

export const ScriptSchema = z.object({
  template: TemplateEnum,
  language: LanguageEnum,
  total_duration_ms: z.number().int(),
  scenes: z.array(SceneSchema).min(1).max(20),
  meta: z
    .object({
      generated_by: z.string(),
      generated_at: z.string(),
      topic: z.string(),
    })
    .passthrough()
    .default({}),
});

// ─── Job status enum ───────────────────────────────────────
export const JobStatusEnum = z.enum([
  "queued",
  "running",
  "completed",
  "failed",
  "expired",
]);

// ─── Helpers ───────────────────────────────────────────────
export const VoicePresets = {
  vi: ["vi-VN-HoaiMyNeural", "vi-VN-NamMinhNeural"],
  en: ["en-US-AriaNeural", "en-US-GuyNeural", "en-US-JennyNeural"],
};
