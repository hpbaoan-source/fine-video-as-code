// ──────────────────────────────────────────────────────────────
// Job store — in-memory job state + event stream per job
// ──────────────────────────────────────────────────────────────
// Each job has:
//   - id, status, input, currentStep
//   - artifacts: { script, durations, audio[], assets[], output }
//   - events:    { type, step?, percent?, message?, payload? }[]
//   - subscribers: Set<callback> for SSE
//
// The store exposes `subscribe(jobId, cb)` to register a listener,
// and `emit(jobId, event)` to push events to all listeners.
// ──────────────────────────────────────────────────────────────

import { EventEmitter } from "node:events";
import { nanoid } from "nanoid";
import { cleanupWorkDir } from "./cleanup.js";

export class JobStore {
  constructor() {
    this.jobs = new Map();          // jobId -> job object
    this.emitters = new Map();      // jobId -> EventEmitter
    this.TTL_MS = 30 * 60 * 1000;  // 30 min after completion
    // Jobs that never reach a terminal state (crashed worker,
    // killed process) would otherwise live forever. Give them a
    // hard max age and reclaim their work directory.
    this.MAX_AGE_MS = 2 * 60 * 60 * 1000; // 2 h from creation
  }

  // ── Create ───────────────────────────────────────────────
  create(input) {
    const id = nanoid(10);
    const emitter = new EventEmitter();
    emitter.setMaxListeners(50);  // many SSE subscribers
    const job = {
      id,
      status: "queued",
      input,
      currentStep: null,
      artifacts: {},
      events: [],
      error: null,
      createdAt: Date.now(),
      startedAt: null,
      completedAt: null,
    };
    this.jobs.set(id, job);
    this.emitters.set(id, emitter);
    return job;
  }

  get(id) {
    return this.jobs.get(id) || null;
  }

  setStatus(id, status, patch = {}) {
    const job = this.jobs.get(id);
    if (!job) return;
    job.status = status;
    Object.assign(job, patch);
    if (status === "running" && !job.startedAt) job.startedAt = Date.now();
    if (status === "completed" || status === "failed") job.completedAt = Date.now();
    this.emit(id, this.terminalEvent(id, job, status));
  }

  /**
   * Build the terminal SSE payload.
   *
   * The `complete` event carries the result metadata the web UI
   * (web/js/app.js) and the API docs (docs/api.md) expect:
   *   { type, filename, size, duration_ms, downloadUrl, warnings }
   * A `failed` event carries the error message so a client that
   * connects *after* the failure still learns why it failed.
   */
  terminalEvent(id, job, status) {
    if (status === "completed") {
      return {
        type: "complete",
        filename: job.outputFilename ?? null,
        size: job.outputSize ?? null,
        duration_ms: job.outputDurationMs ?? null,
        downloadUrl: `/api/download/${id}`,
        warnings: Array.isArray(job.warnings) ? job.warnings : [],
      };
    }
    if (status === "failed") {
      return {
        type: "failed",
        message: job.error ?? "Job failed",
      };
    }
    return { type: status };
  }

  // ── Event stream ─────────────────────────────────────────
  emit(jobId, event) {
    const emitter = this.emitters.get(jobId);
    if (!emitter) return;
    const job = this.jobs.get(jobId);
    if (job) job.events.push({ ...event, t: Date.now() });
    emitter.emit("event", event);
  }

  subscribe(jobId, cb) {
    const emitter = this.emitters.get(jobId);
    if (!emitter) return () => {};
    emitter.on("event", cb);
    return () => emitter.off("event", cb);
  }

  /**
   * Drop a job completely (used when the queue refuses the job —
   * otherwise the record would stay in the map as "queued" forever).
   */
  remove(id) {
    if (!this.jobs.has(id)) return false;
    this.emitters.get(id)?.removeAllListeners();
    this.emitters.delete(id);
    this.jobs.delete(id);
    cleanupWorkDir(id).catch(() => {});
    return true;
  }

  // ── Cleanup ──────────────────────────────────────────────
  gc() {
    const now = Date.now();
    const cleanups = [];
    for (const [id, job] of this.jobs) {
      const terminal = job.completedAt && now - job.completedAt > this.TTL_MS;
      // Non-terminal jobs (queued/running) expire on a hard max
      // age so the map and tmp/jobs cannot grow without bound.
      const stale = !job.completedAt && now - job.createdAt > this.MAX_AGE_MS;
      if (!terminal && !stale) continue;

      job.status = "expired";
      // Tell the subscribers before their listeners go away — an
      // SSE client must not wait forever for a terminal event.
      this.emit(id, { type: "expired", message: "Job expired" });
      this.emitters.get(id)?.removeAllListeners();
      this.emitters.delete(id);
      // Best-effort: remove the on-disk workDir so tmp/jobs
      // doesn't fill the disk. The job entry stays in memory
      // for a bit so the download endpoint can return 410.
      cleanups.push(cleanupWorkDir(id).catch(() => {}));
      const timer = setTimeout(() => {
        this.jobs.delete(id);
      }, 5 * 60 * 1000);
      // Never keep the process alive just to expire a job.
      timer.unref?.();
    }
    // Resolves once the work directories are gone (the GC timer
    // ignores the result, tests await it).
    return Promise.all(cleanups);
  }

  stats() {
    return {
      total: this.jobs.size,
      queued: [...this.jobs.values()].filter((j) => j.status === "queued").length,
      running: [...this.jobs.values()].filter((j) => j.status === "running").length,
      completed: [...this.jobs.values()].filter((j) => j.status === "completed").length,
      failed: [...this.jobs.values()].filter((j) => j.status === "failed").length,
    };
  }
}

export const jobStore = new JobStore();
// The GC timer must never hold the process open — CLI tools
// (scripts/render-sample.js) would hang after a successful render.
const gcTimer = setInterval(() => jobStore.gc(), 60 * 1000);
gcTimer.unref?.();
