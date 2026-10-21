// ──────────────────────────────────────────────────────────────
// Workflow orchestrator — runs the steps in sequence
// ──────────────────────────────────────────────────────────────
// Emits SSE events for each step:
//   { type: "step-start",    step, name }
//   { type: "step-progress", step, percent }
//   { type: "step-done",     step, output, meta }
//   { type: "log",           message }
//   { type: "complete" }  ← emitted by jobStore.setStatus("completed")
//   { type: "error"   }    ← emitted on failure
//
// Each step writes its output into workDir, so the final MP4 is
// reproducible from on-disk artifacts even after the job is gone.
// ──────────────────────────────────────────────────────────────

import path from "node:path";
import fs from "node:fs/promises";
import { jobStore } from "../lib/job-store.js";
import { cleanupWorkDir } from "../lib/cleanup.js";
import { jobWorkDir } from "../lib/paths.js";
import { step1Script } from "./step1-script.js";
import { step2TTS } from "./step2-tts.js";
import { step4Render } from "./step4-render.js";

const STEPS = [
  { id: "script", name: "Step 1: Scripting", run: runStep1 },
  { id: "tts", name: "Step 2: TTS Audio", run: runStep2 },
  { id: "render", name: "Step 4: Render MP4", run: runStep4 },
];

export async function runWorkflow(job) {
  const workDir = jobWorkDir(job.id);
  await fs.mkdir(workDir, { recursive: true });
  jobStore.setStatus(job.id, "running", { workDir });
  jobStore.emit(job.id, { type: "log", message: `Workdir: ${workDir}` });

  // `ctx.state` is for internal artifacts only — it is never
  // returned by /api/status/:id/snapshot. `ctx.input` is the
  // public, validated form of the user request.
  const ctx = {
    input: job.input,
    workDir,
    state: {
      script: null,
      audioDir: null,
      renderOutput: null,
      warnings: [],
    },
    onLog: (msg) => jobStore.emit(job.id, { type: "log", message: msg }),
    onProgress: (step, percent) =>
      jobStore.emit(job.id, { type: "step-progress", step, percent }),
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
        message: `[fail] ${step.name}: ${err.message}`,
      });
      throw err;
    }
  }

  // setStatus emits {type: "complete"} for us, so don't also emit
  // it from here — emitting it twice makes SSE clients see two
  // "complete" events and close the stream twice.
  if (!ctx.state.renderOutput?.path) {
    throw new Error("Render step finished without producing an output file");
  }
  const finalPath = ctx.state.renderOutput.path;
  const finalFilename = ctx.state.renderOutput.filename;
  const stat = await fs.stat(finalPath);
  // Total timeline length = sum of the (TTS-measured) scene
  // durations. Reported to the client as `duration_ms`.
  const durationMs = (ctx.state.script?.scenes || []).reduce(
    (acc, s) => acc + (s.duration_ms || 0),
    0
  );
  jobStore.setStatus(job.id, "completed", {
    outputPath: finalPath,
    outputFilename: finalFilename,
    outputSize: stat.size,
    outputDurationMs: durationMs || null,
    warnings: ctx.state.warnings || [],
  });
}

async function runStep1(ctx) {
  const script = await step1Script(ctx.input, {
    onLog: ctx.onLog,
    onProgress: (p) => ctx.onProgress("script", p),
  });
  ctx.onLog?.(`Scripting complete — ${script.scenes.length} scenes`);
  ctx.state.script = script;
  const p = path.join(ctx.workDir, "script.json");
  await fs.writeFile(p, JSON.stringify(script, null, 2), "utf8");
  return {
    _artifact: "script.json",
    _meta: { sceneCount: script.scenes.length, total_ms: script.total_duration_ms },
  };
}

async function runStep2(ctx) {
  // step2TTS overwrites each scene's duration_ms with the actual
  // TTS-measured length, so step 4 can trust the same number for
  // both video timing and audio concat — no drift possible.
  const tts = await step2TTS(ctx.state.script, {
    input: ctx.input,
    workDir: ctx.workDir,
    onLog: ctx.onLog,
    onProgress: (p) => ctx.onProgress("tts", p),
  });
  ctx.state.audioDir = tts.audioDir;
  // Keep the warnings (e.g. a TTS clip that fell back to silence)
  // so they can be reported with the terminal `complete` event.
  ctx.state.warnings = tts.warnings || [];
  // Persist the updated script so the disk artifact matches what
  // step 4 will render.
  await fs.writeFile(
    path.join(ctx.workDir, "script.json"),
    JSON.stringify(ctx.state.script, null, 2),
    "utf8"
  );
  return {
    _artifact: "audio/",
    _meta: { audioDir: tts.audioDir, warnings: tts.warnings },
  };
}

async function runStep4(ctx) {
  // step4Render takes script only — no separate `durations` artifact
  // is needed since step 2 already wrote the actual lengths onto
  // each scene.
  const result = await step4Render({
    script: ctx.state.script,
    input: ctx.input,
    workDir: ctx.workDir,
    onLog: ctx.onLog,
    onProgress: (p) => ctx.onProgress("render", p),
  });
  ctx.state.renderOutput = result;
  return { _artifact: result.filename, _meta: { size: result.size, t0_offset_ms: result.t0OffsetMs } };
}

// Re-export for tests / external callers. Implementation lives in
// lib/cleanup.js to keep the dependency graph acyclic.
export { cleanupWorkDir };
