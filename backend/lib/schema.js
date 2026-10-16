// ──────────────────────────────────────────────────────────────
// Zod schemas — single source of truth for input/output validation
// ──────────────────────────────────────────────────────────────

import { z } from "zod";

// ─── Templates ──────────────────────────────────────────────
export const TemplateEnum = z.enum(["tech-explainer", "promo", "tutorial"]);
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
  outputFilename: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[\w\- ]{1,80}$/, "outputFilename may only contain letters, digits, underscore, hyphen, and spaces")
    .optional(),
});

// ─── Scene schema (Step 1 output) ──────────────────────────
export const VisualCueSchema = z.object({
  type: z.enum(["text", "icon", "chart", "shape", "code", "image"]),
  content: z.string(),
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
