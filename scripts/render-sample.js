// ──────────────────────────────────────────────────────────────
// render-sample.js — render 1 sample end-to-end
// ──────────────────────────────────────────────────────────────
// Usage:  node scripts/render-sample.js <sample-name>
// Example: node scripts/render-sample.js 01-cloud-computing
// ──────────────────────────────────────────────────────────────

import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const sample = process.argv[2];
if (!sample) {
  console.error("Usage: node scripts/render-sample.js <sample-folder-name>");
  console.error("  e.g. node scripts/render-sample.js 01-cloud-computing");
  process.exit(1);
}

const root = resolve(process.cwd());
const sampleDir = join(root, "samples", sample);
const inputFile = join(sampleDir, "input.json");

if (!existsSync(sampleDir)) {
  console.error(`❌ Sample folder not found: ${sampleDir}`);
  process.exit(1);
}
if (!existsSync(inputFile)) {
  console.error(`❌ input.json not found in ${sampleDir}`);
  console.error(`   (Will be added in M5 — for now this is a placeholder.)`);
  process.exit(1);
}

console.log(`[TODO Phase 5] render-sample.js is a stub.`);
console.log(`  Sample: ${sample}`);
console.log(`  Input:  ${inputFile}`);
console.log(`  → Will call backend /api/generate with this input and save output to samples/${sample}/video.mp4`);
process.exit(0);
