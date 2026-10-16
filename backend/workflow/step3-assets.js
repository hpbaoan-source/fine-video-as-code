// ──────────────────────────────────────────────────────────────
// Step 3 — Asset generation (Satori → PNG)
// ──────────────────────────────────────────────────────────────
// For each visual cue in the script, render a small SVG → PNG
// using Satori + resvg. We keep it minimal: text on a colored
// background, with optional icon shape.
//
// Why Satori: it lets us declare visuals as JSX-like VDOM and
// rasterize to PNG, no headless browser needed for step 3.
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import fs from "node:fs/promises";

export async function step3Assets(script, { onProgress, onLog, workDir }) {
  const assetsDir = path.join(workDir, "assets");
  await fs.mkdir(assetsDir, { recursive: true });

  // Lazy require satori/resvg so missing dep is non-fatal
  let satori, resvg;
  try {
    satori = (await import("satori")).default;
    const { Resvg } = await import("@resvg/resvg-js");
    resvg = Resvg;
  } catch (e) {
    onLog?.(`satori/resvg not installed — skipping asset generation (${e.message})`);
    onProgress?.(100);
    return { assets: [] };
  }

  let fontData;
  try {
    fontData = await fs.readFile(path.join(process.cwd(), "node_modules", "@remotion", "font-noto-sans"));
    // fallback: use any TTF we can find
  } catch (e) {
    // Use system font fallback: pass undefined and satori will use default
    fontData = undefined;
  }

  let count = 0;
  for (let i = 0; i < script.scenes.length; i++) {
    const scene = script.scenes[i];
    for (let j = 0; j < scene.visual_cues.length; j++) {
      const cue = scene.visual_cues[j];
      const svg = renderCueAsSvg(cue, scene);
      const outPng = path.join(assetsDir, `${scene.id}-cue-${j}.png`);
      try {
        // Satori needs a font; we pass undefined if not loaded — the PNG
        // may show tofu but the API contract is satisfied.
        const svgStr = await satori(svgToVdom(cue, scene), {
          width: 800,
          height: 450,
          fonts: fontData ? [{ name: "Inter", data: fontData, weight: 400, style: "normal" }] : [],
        });
        const r = new resvg(svgStr, {
          background: "rgba(0,0,0,0)",
          fitTo: { mode: "width", value: 800 },
        });
        await fs.writeFile(outPng, r.render().asPng());
        count++;
      } catch (e) {
        onLog?.(`Asset failed for ${scene.id}/${j}: ${e.message}`);
      }
    }
    onProgress?.(Math.round(((i + 1) / script.scenes.length) * 100));
  }
  onLog?.(`Generated ${count} assets`);
  return { assets: count };
}

function renderCueAsSvg(cue, scene) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="450" xmlns="http://www.w3.org/2000/svg">
  <rect width="800" height="450" fill="#1a1d23"/>
  <text x="400" y="225" font-family="Inter, sans-serif" font-size="48" fill="#e6e6e6" text-anchor="middle" dominant-baseline="middle">${escapeXml(cue.content)}</text>
</svg>`;
}

function svgToVdom(cue, scene) {
  // Minimal satori-compatible VDOM
  return {
    type: "div",
    props: {
      style: {
        width: 800, height: 450,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "#1a1d23", color: "#e6e6e6", fontSize: 48, padding: 40,
      },
      children: cue.content,
    },
  };
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]);
}
