// ──────────────────────────────────────────────────────────────
// scripts/_preview-scenes.js — quick visual check of one sample's
// scenes (one PNG per scene, mid-scene timestamp). Not part of the
// product; a dev aid for checking template layout.
//
// Usage: node scripts/_preview-scenes.js <sample-folder>
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import fs from "node:fs/promises";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, "..");

const sampleName = process.argv[2];
const sampleDir = path.join(projectRoot, "samples", sampleName);
const script = JSON.parse(await fs.readFile(path.join(sampleDir, "script.json"), "utf8"));

const TEMPLATE_DIR = path.join(projectRoot, "backend", "templates");
const TEMPLATE_FILES = {
  "tech-explainer": "tech-explainer.html",
  promo: "promo.html",
  tutorial: "tutorial.html",
};

const outDir = path.join(projectRoot, "tmp", `preview-${sampleName}`);
await fs.mkdir(outDir, { recursive: true });

const sceneData = {
  topic: script.meta?.topic || sampleName,
  scenes: script.scenes.map((s) => ({
    id: s.id,
    heading: s.heading,
    voiceover: s.voiceover,
    on_screen_text: s.on_screen_text,
    visual_cues: s.visual_cues || [],
    duration_ms: s.duration_ms || 3000,
    badge: s.badge,
    subheading: s.subheading,
    bullets: s.bullets || [],
    metrics: s.metrics || [],
    codeSnippet: s.codeSnippet,
    diagram: s.diagram,
  })),
  brand: { brandColor: "#3B82F6", accentColor: "#F59E0B", fontFamily: "Inter" },
};
await fs.writeFile(path.join(outDir, "data.json"), JSON.stringify(sceneData, null, 2), "utf8");

const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  const rel = url === "/" ? "/index.html" : url;
  const file = rel.startsWith("/_data/")
    ? path.join(outDir, rel.slice("/_data/".length))
    : path.join(TEMPLATE_DIR, rel);
  try {
    const buf = await fs.readFile(file);
    res.writeHead(200, {
      "Content-Type": rel.endsWith(".json") ? "application/json" : "text/html",
    });
    res.end(buf);
  } catch {
    res.writeHead(404);
    res.end("nope");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on("pageerror", (e) => console.log("[page error]", e.message));

const tpl = TEMPLATE_FILES[script.template];
await page.goto(`http://127.0.0.1:${port}/${tpl}?render=1&deterministic=1&data=_data/data.json`, {
  waitUntil: "domcontentloaded",
});
await page.waitForFunction(() => typeof window.__seek === "function", null, { timeout: 15000 });

let t = 0;
for (let i = 0; i < sceneData.scenes.length; i++) {
  const s = sceneData.scenes[i];
  t += s.duration_ms / 2;
  await page.evaluate((ms) => window.__seek(ms), t);
  t += s.duration_ms / 2;
  const out = path.join(outDir, `scene-${String(i + 1).padStart(2, "0")}.png`);
  await page.screenshot({ path: out, type: "png" });
  console.log("wrote", out);
}

await browser.close();
server.close();
console.log("done ->", outDir);
