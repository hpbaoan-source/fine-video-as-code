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

class JobStore {
  constructor() {
    this.jobs = new Map();          // jobId -> job object
    this.emitters = new Map();      // jobId -> EventEmitter
    this.TTL_MS = 30 * 60 * 1000;  // 30 min after completion
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
    this.emit(id, { type: status === "completed" ? "complete" : status });
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

  // ── Cleanup ──────────────────────────────────────────────
  gc() {
    const now = Date.now();
    for (const [id, job] of this.jobs) {
      if (job.completedAt && now - job.completedAt > this.TTL_MS) {
        job.status = "expired";
        this.emitters.get(id)?.removeAllListeners();
        this.emitters.delete(id);
        // keep `jobs` for a bit so download endpoint can return 410
        setTimeout(() => {
          this.jobs.delete(id);
        }, 5 * 60 * 1000);
      }
    }
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
setInterval(() => jobStore.gc(), 60 * 1000);
