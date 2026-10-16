// ──────────────────────────────────────────────────────────────
// Workflow orchestrator — runs the 4 steps in sequence
// ──────────────────────────────────────────────────────────────
// Emits SSE events for each step:
//   { type: "step-start", step: "script", name: "Step 1: Scripting" }
//   { type: "step-progress", step: "script", percent: 40 }
//   { type: "step-done", step: "script", output: "script.json" }
//   { type: "log", message: "..." }
//   { type: "complete", downloadUrl, duration }
//   { type: "error", message }
//
// Each step also writes its output under workDir, so the
// final MP4 is fully reproducible from disk artifacts.
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import fs from "node:fs/promises";
import { nanoid } from "nanoid";
import { jobStore } from "../lib/job-store.js";
import { step1Script } from "./step1-script.js";
import { step2TTS } from "./step2-tts.js";
import { step3Assets } from "./step3-assets.js";
import { step4Render } from "./step4-render.js";

const STEPS = [
  { id: "script", name: "Step 1: Scripting",   run: runStep1 },
  { id: "tts",    name: "Step 2: TTS Audio",   run: runStep2 },
  { id: "assets", name: "Step 3: Asset Gen",   run: runStep3 },
  { id: "render", name: "Step 4: Render MP4",  run: runStep4 },
];

export async function runWorkflow(job) {
  const workDir = path.join(process.cwd(), "tmp", "jobs", job.id);
  await fs.mkdir(workDir, { recursive: true });
  jobStore.setStatus(job.id, "running", { workDir });
  jobStore.emit(job.id, { type: "log", message: `Workdir: ${workDir}` });

  const input = job.input;
  const ctx = {
    input,
    workDir,
    onLog: (msg) => jobStore.emit(job.id, { type: "log", message: msg }),
    onProgress: (percent) => jobStore.emit(job.id, { type: "step-progress", percent }),
  };

  for (const step of STEPS) {
    jobStore.emit(job.id, { type: "step-start", step: step.id, name: step.name });
    try {
      const result = await step.run(ctx);
      jobStore.emit(job.id, {
        type: "step-done",
        step: step.id,
        output: result._artifact || null,
        meta: result._meta || null,
      });
    } catch (err) {
      jobStore.emit(job.id, {
        type: "log",
        message: `❌ ${step.name} failed: ${err.message}`,
      });
      throw err;
    }
  }

  // Mark complete
  // Step 4 returns the actual file path it wrote (could be .mp4,
  // .mp4.placeholder.json, or a real MP4 if Remotion ran). Use
  // its path/filename — don't assume a name.
  const finalPath = ctx.input._renderOutput;
  const finalFilename = ctx.input._renderFilename;
  const stat = await fs.stat(finalPath);

  jobStore.setStatus(job.id, "completed", {
    outputPath: finalPath,
    outputFilename: finalFilename,
    outputSize: stat.size,
  });
  jobStore.emit(job.id, {
    type: "complete",
    downloadUrl: `/api/download/${job.id}`,
    filename: finalFilename,
    size: stat.size,
    duration_ms: input.duration * 1000,
  });
}

// ─── Per-step wrappers ─────────────────────────────────────
async function runStep1(ctx) {
  const script = await step1Script(ctx.input, ctx);
  await ctx.onLog?.(`Scripting complete — ${script.scenes.length} scenes`);
  ctx.input._script = script;
  const p = path.join(ctx.workDir, "script.json");
  await fs.writeFile(p, JSON.stringify(script, null, 2), "utf8");
  return { _artifact: "script.json", _meta: { sceneCount: script.scenes.length } };
}

async function runStep2(ctx) {
  const durations = await step2TTS(ctx.input._script, {
    onLog: ctx.onLog,
    onProgress: ctx.onProgress,
    workDir: ctx.workDir,
    voice: ctx.input.voice,
  });
  ctx.input._durations = durations;
  const p = path.join(ctx.workDir, "durations.json");
  await fs.writeFile(p, JSON.stringify(durations, null, 2), "utf8");
  return { _artifact: "durations.json", _meta: { totalMs: durations.total_duration_ms } };
}

async function runStep3(ctx) {
  const result = await step3Assets(ctx.input._script, {
    onLog: ctx.onLog,
    onProgress: ctx.onProgress,
    workDir: ctx.workDir,
  });
  return { _artifact: "assets/", _meta: { count: result.assets } };
}

async function runStep4(ctx) {
  const result = await step4Render({
    script: ctx.input._script,
    durations: ctx.input._durations,
    input: ctx.input,
    workDir: ctx.workDir,
    onLog: ctx.onLog,
    onProgress: ctx.onProgress,
  });
  ctx.input._renderOutput = result.path;
  ctx.input._renderFilename = result.filename;
  return { _artifact: result.filename, _meta: { size: result.size } };
}
