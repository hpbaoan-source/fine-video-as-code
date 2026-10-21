// ──────────────────────────────────────────────────────────────
// Video size helpers — map the API's `resolution` + `aspectRatio`
// onto a concrete pixel size.
//
// The renderer used to hardcode a 1920×1080 viewport, so asking
// for 9:16 (or 720p) produced a 16:9 1080p file. These helpers are
// pure so they can be unit-tested without a browser.
// ──────────────────────────────────────────────────────────────

// Landscape 16:9 sizes per resolution label. The *height* is the
// anchor: for other aspect ratios we keep the height and derive
// the width from the ratio, so a 1080p 9:16 clip is 1080×1920.
export const RESOLUTION_HEIGHTS = {
  "480p": 480,
  "720p": 720,
  "1080p": 1080,
  "1440p": 1440,
  "2160p": 2160,
};

// Width / height ratios for the supported aspect ratios.
export const ASPECT_RATIOS = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "1:1": 1,
  "4:3": 4 / 3,
};

export const DEFAULT_RESOLUTION = "1080p";
export const DEFAULT_ASPECT_RATIO = "16:9";

/**
 * Resolve a pixel size for the given resolution + aspect ratio.
 * Returns `{ width, height }` — both even numbers (required by
 * the h264 encoder).
 */
export function resolveViewport(resolution, aspectRatio) {
  const resKey = Object.prototype.hasOwnProperty.call(RESOLUTION_HEIGHTS, resolution)
    ? resolution
    : DEFAULT_RESOLUTION;
  const ratioKey = Object.prototype.hasOwnProperty.call(ASPECT_RATIOS, aspectRatio)
    ? aspectRatio
    : DEFAULT_ASPECT_RATIO;

  const height = RESOLUTION_HEIGHTS[resKey];
  const ratio = ASPECT_RATIOS[ratioKey];

  // Anchor on the short side: the base height stays the "height"
  // of the frame for landscape/square, and becomes the width for
  // portrait (9:16).
  let width;
  let finalHeight;
  if (ratio >= 1) {
    finalHeight = height;
    width = Math.round((height * ratio) / 2) * 2;
  } else {
    finalHeight = Math.round((height / ratio) / 2) * 2;
    width = height;
  }
  return { width, height: finalHeight };
}

/**
 * ffmpeg's `-s` argument for a pixel size, e.g. "1920x1080".
 */
export function sizeArg(size) {
  return `${size.width}x${size.height}`;
}
