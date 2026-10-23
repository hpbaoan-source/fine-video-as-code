// ──────────────────────────────────────────────────────────────
// Design-system middleware
// ──────────────────────────────────────────────────────────────
//
// A script is prose; a video frame is a grid. This module is the
// bridge: it takes whatever a human or an LLM wrote and trims it
// to a budget the renderer can lay out without collisions.
//
// Everything here is pure and side-effect free so it can run
//   • right after the LLM writes a script  (step 1)
//   • right before the frame is rendered  (step 4, safety net)
// and be unit-tested without a browser.
//
// The rules are intentionally boring: fewer words, fewer blocks,
// one idea per scene. Boring rules are what keep a 90-second video
// readable at 1080p.
// ──────────────────────────────────────────────────────────────

import { deriveHeading, truncate, squish, capCodeSnippet, deriveCueLabel } from "./text.js";

// ─── Canonical templates + aliases ───────────────────────────
//
// Scripts written by hand (or by an older LLM prompt) often use
// a different word for the same template. Map them instead of
// failing the whole job with "Unknown template".
export const TEMPLATES = ["tech-explainer", "promo", "tutorial"];

export const TEMPLATE_ALIASES = {
  "tech-explainer": "tech-explainer",
  tech: "tech-explainer",
  techie: "tech-explainer",
  explainer: "tech-explainer",
  explain: "tech-explainer",
  deep: "tech-explainer",
  promo: "promo",
  ad: "promo",
  "promo-ad": "promo",
  social: "promo",
  teaser: "promo",
  tutorial: "tutorial",
  howto: "tutorial",
  "how-to": "tutorial",
  guide: "tutorial",
  sop: "tutorial",
  walkthrough: "tutorial",
  // Legacy names kept working — they map onto the closest layout.
  "top-list": "tutorial",
  checklist: "tutorial",
  steps: "tutorial",
};

export function normalizeTemplate(name) {
  const key = String(name ?? "").trim().toLowerCase();
  if (!key) return null;
  if (TEMPLATES.includes(key)) return key;
  return TEMPLATE_ALIASES[key] || null;
}

// ─── Content budgets ─────────────────────────────────────────
//
// A 1920×1080 frame with a 64px safe area gives us roughly
// 1790×900 px of usable space. These numbers come from what
// actually fits there, not from taste.
export const CONTENT_BUDGETS = {
  maxHeadingChars: 64,
  maxSubheadingChars: 150,
  maxCueChars: 70,
  maxBullets: 3,
  maxBulletChars: 110,
  maxMetrics: 3,
  maxMetricValueChars: 24,
  maxMetricLabelChars: 48,
  maxDiagramNodes: 4,
  maxDiagramSteps: 4,
  maxCodeLines: 8,
  maxCodeLineChars: 120,
  minDurationMs: 1500,
  maxDurationMs: 30000,
};

// ─── Layout variants ─────────────────────────────────────────
//
//   title  — one centred idea (opener / closing card)
//   split  — hero on the left, content on the right
//   stack  — title on top, content underneath
export const LAYOUTS = ["title", "split", "stack"];

function hasBody(scene) {
  return Boolean(
    (scene.bullets && scene.bullets.length) ||
      (scene.metrics && scene.metrics.length) ||
      scene.codeSnippet ||
      (scene.diagram && (scene.diagram.nodes?.length || scene.diagram.steps?.length))
  );
}

function hasIllustration(scene) {
  return Boolean(
    scene.flowArchitecture ||
      scene.sequenceFlow ||
      scene.hierarchyTree ||
      scene.compareMatrix
  );
}

function hasHero(scene) {
  return (
    hasIllustration(scene) ||
    (scene.visual_cues || []).some(
      (c) => c && (c.type === "icon" || c.type === "image" || c.type === "chart")
    )
  );
}

/**
 * Pick the layout variant for a scene.
 * An explicit `scene.layout` always wins — a hand-written script
 * should be able to say "I want this one split".
 */
export function pickLayout(scene, index, total, template) {
  if (LAYOUTS.includes(scene.layout)) return scene.layout;
  if (hasIllustration(scene)) return "split";
  const body = hasBody(scene);
  const hero = hasHero(scene);
  if (index === 0 && (!body || template === "promo")) return "title";
  if (body && hero) return "split";
  if (index === total - 1 && !body) return "title";
  return "stack";
}

/**
 * Normalise one scene to the content budget.
 * Returns a NEW scene object plus the list of changes applied.
 */
export function normalizeScene(scene, ctx = {}) {
  const { index = 0, total = 1, template = "tech-explainer", language = "vi" } = ctx;
  const b = CONTENT_BUDGETS;
  const changes = [];
  const out = { ...scene };

  // ── heading ────────────────────────────────────────────────
  let heading = squish(out.heading || "");
  if (!heading) {
    heading = deriveHeading(out.voiceover || "", language);
    if (heading) changes.push(`heading: derived from voiceover`);
  }
  if (heading.length > b.maxHeadingChars) {
    heading = truncate(heading, b.maxHeadingChars);
    changes.push(`heading: clamped to ${b.maxHeadingChars} chars`);
  }
  out.heading = heading;

  // ── subheading ─────────────────────────────────────────────
  if (out.subheading) {
    const sub = squish(out.subheading);
    if (sub.length > b.maxSubheadingChars) {
      out.subheading = truncate(sub, b.maxSubheadingChars);
      changes.push(`subheading: clamped to ${b.maxSubheadingChars} chars`);
    } else {
      out.subheading = sub;
    }
  }

  // ── visual cue caption ─────────────────────────────────────
  if (out.visual_cue) {
    const cue = squish(out.visual_cue);
    if (cue.length > b.maxCueChars) {
      out.visual_cue = truncate(cue, b.maxCueChars);
      changes.push(`visual_cue: clamped to ${b.maxCueChars} chars`);
    } else {
      out.visual_cue = cue;
    }
  }

  // ── bullets ────────────────────────────────────────────────
  if (Array.isArray(out.bullets)) {
    const before = out.bullets.length;
    const bullets = out.bullets
      .map((t) => squish(t))
      .filter(Boolean)
      .slice(0, b.maxBullets)
      .map((t) => (t.length > b.maxBulletChars ? truncate(t, b.maxBulletChars) : t));
    if (before !== bullets.length) changes.push(`bullets: ${before} → ${bullets.length}`);
    out.bullets = bullets;
  }

  // ── metrics ────────────────────────────────────────────────
  if (Array.isArray(out.metrics)) {
    const before = out.metrics.length;
    const metrics = out.metrics
      .filter((m) => m && squish(m.value))
      .slice(0, b.maxMetrics)
      .map((m) => ({
        value: truncate(squish(m.value), b.maxMetricValueChars),
        ...(m.label ? { label: truncate(squish(m.label), b.maxMetricLabelChars) } : {}),
      }));
    if (before !== metrics.length) changes.push(`metrics: ${before} → ${metrics.length}`);
    out.metrics = metrics;
  }

  // ── diagram ────────────────────────────────────────────────
  if (out.diagram) {
    const nodes = (out.diagram.nodes || []).map((n) => squish(n)).filter(Boolean).slice(0, b.maxDiagramNodes);
    const steps = (out.diagram.steps || []).map((s) => squish(s)).filter(Boolean).slice(0, b.maxDiagramSteps);
    if ((out.diagram.nodes || []).length !== nodes.length) changes.push(`diagram.nodes: → ${nodes.length}`);
    if ((out.diagram.steps || []).length !== steps.length) changes.push(`diagram.steps: → ${steps.length}`);
    out.diagram = { ...(nodes.length ? { nodes } : {}), ...(steps.length ? { steps } : {}) };
    if (!nodes.length && !steps.length) delete out.diagram;
  }

  // ── code snippet ───────────────────────────────────────────
  if (out.codeSnippet) {
    const capped = capCodeSnippet(out.codeSnippet, b.maxCodeLines, b.maxCodeLineChars);
    if (capped !== out.codeSnippet) changes.push(`codeSnippet: capped at ${b.maxCodeLines} lines`);
    out.codeSnippet = capped;
  }

  // ── layout ─────────────────────────────────────────────────
  const layout = pickLayout(out, index, total, template);
  if (layout !== out.layout) changes.push(`layout: ${layout}`);
  out.layout = layout;

  return { scene: out, changes };
}

/**
 * Normalise a whole script.
 * Returns `{ script, report }` — the report lists every change so
 * the workflow log can show exactly what was trimmed.
 */
export function normalizeScript(script, options = {}) {
  const { template = script.template, language = script.language || "vi", clampDuration = false } = options;
  const scenes = script.scenes || [];
  const report = [];
  const normalizedScenes = scenes.map((scene, i) => {
    const { scene: s, changes } = normalizeScene(scene, {
      index: i,
      total: scenes.length,
      template,
      language,
    });
    if (changes.length) report.push({ scene: scene.id || `scene-${i + 1}`, changes });
    if (clampDuration) {
      const ms = Math.max(
        CONTENT_BUDGETS.minDurationMs,
        Math.min(CONTENT_BUDGETS.maxDurationMs, s.duration_ms || 0)
      );
      if (ms !== s.duration_ms) s.duration_ms = ms;
    }
    return s;
  });
  return {
    script: { ...script, scenes: normalizedScenes },
    report,
  };
}

/**
 * Derive a caption for scenes that do not declare one, so the
 * "what you are looking at" line is never blank.
 */
export function fillCueCaptions(script, language = "vi") {
  for (const scene of script.scenes || []) {
    if (!scene.visual_cue) {
      const derived = deriveCueLabel(scene.heading || scene.voiceover || "", language);
      if (derived) scene.visual_cue = derived;
    }
  }
  return script;
}
