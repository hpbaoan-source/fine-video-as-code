// ──────────────────────────────────────────────────────────────
// scripts/render-sample.js — re-render a curated sample by name
// ──────────────────────────────────────────────────────────────
// Usage:  npm run render-sample -- <sample-folder>
//   e.g.  npm run render-sample -- 01-how-https-works
//
// Reads samples/<name>/script.json, builds a synthetic input that
// uses the `presetScript` field, calls runWorkflow in-process, then
// copies the produced MP4 to samples/<name>/video.mp4 (overwriting
// the old one).
//
// Requires: node 20+, edge-tts on PATH, Playwright Chromium
// already installed (`npx playwright install chromium`).
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { runWorkflow } from "../backend/workflow/index.js";
import { jobStore } from "../backend/lib/job-store.js";
import { GenerateInputSchema } from "../backend/lib/schema.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = path.join(__dirname, "..");

const sampleName = process.argv[2];
if (!sampleName) {
  console.error("Usage: npm run render-sample -- <sample-folder>");
  console.error("  e.g. npm run render-sample -- 01-how-https-works");
  process.exit(1);
}

const sampleDir = path.join(projectRoot, "samples", sampleName);
const scriptPath = path.join(sampleDir, "script.json");
const outputPath = path.join(sampleDir, "video.mp4");

// Read the script to know its template/language/voice (so we can
// build a valid GenerateInput that Schema.parse will accept).
const script = JSON.parse(await fs.readFile(scriptPath, "utf8"));
const sceneSumMs = (script.scenes || []).reduce((s, sc) => s + (sc.duration_ms || 0), 0);
const durationSec = Math.max(15, Math.round(sceneSumMs / 1000));

// Use the absolute path so runWorkflow finds it regardless of cwd.
const input = GenerateInputSchema.parse({
  topic: script.meta?.topic || sampleName,
  template: script.template,
  language: script.language,
  voice: script.voice,
  duration: durationSec,
  presetScript: scriptPath,
  outputFilename: "video",
  ...(script.aspectRatio ? { aspectRatio: script.aspectRatio } : {}),
  ...(script.resolution ? { resolution: script.resolution } : {}),
  ...(script.brandColor ? { brandColor: script.brandColor } : {}),
  ...(script.accentColor ? { accentColor: script.accentColor } : {}),
});

const job = jobStore.create(input);
console.log(`▶ Rendering ${sampleName} (jobId=${job.id})`);

// Tee the SSE-like event log to stdout.
const unsubscribe = jobStore.subscribe(job.id, (evt) => {
  if (evt.type === "log") console.log(`  ${evt.message}`);
  else if (evt.type === "step-progress") console.log(`  [${evt.step}] ${evt.percent}%`);
  else if (evt.type === "step-done") console.log(`  ✓ step ${evt.step} done`);
  else if (evt.type === "complete") console.log(`  ✓ complete`);
  else if (evt.type === "error") console.log(`  ✗ ${evt.payload?.error || "error"}`);
});

try {
  await runWorkflow(job);
} finally {
  unsubscribe();
}

const finalJob = jobStore.get(job.id);
if (!finalJob || finalJob.status !== "completed") {
  console.error(`✗ Render failed: status=${finalJob?.status}, error=${finalJob?.error}`);
  process.exit(1);
}

// Copy the MP4 from the per-job workDir to the sample folder.
const srcPath = finalJob.outputPath;
await fs.copyFile(srcPath, outputPath);
const stat = await fs.stat(outputPath);
console.log(`✓ Saved ${outputPath} (${(stat.size / 1024).toFixed(1)} KB)`);
