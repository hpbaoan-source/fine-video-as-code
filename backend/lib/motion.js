// ──────────────────────────────────────────────────────────────
// backend/lib/motion.js — Motion physics & easing curves
// ──────────────────────────────────────────────────────────────
// Pure mathematical functions for deterministic animation timing.
// Inspired by Vincentwei1021/video-shotcraft Polish & Motion utilities.
// Safe for both server-side timing estimation and browser runtime.
// ──────────────────────────────────────────────────────────────

export const Easing = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t) => 1 - Math.pow(1 - t, 4),
  inQuart: (t) => Math.pow(t, 4),
  outExpo: (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inExpo: (t) => (t === 0 ? 0 : Math.pow(2, 10 * t - 10)),
  // Overshoot easing: overshoots target slightly then springs back into place.
  // s = 1.70158 gives ~10% overshoot, matching classic CSS/Framer motion.
  outBack: (t, s = 1.70158) => {
    const k = t - 1;
    return 1 + (s + 1) * Math.pow(k, 3) + s * Math.pow(k, 2);
  },
  inBack: (t, s = 1.70158) => {
    return (s + 1) * Math.pow(t, 3) - s * Math.pow(t, 2);
  },
  outElastic: (t) => {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin(((t * 10 - 0.75) * (2 * Math.PI)) / 3) + 1;
  },
};

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function clamp(v, min, max) {
  return Math.min(Math.max(v, min), max);
}

/**
 * Segmented progress between two thresholds [from, to] within [0, 1].
 */
export function seg(progress, from, to) {
  if (to <= from) return progress >= from ? 1 : 0;
  return clamp((progress - from) / (to - from), 0, 1);
}
