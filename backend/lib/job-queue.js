// ──────────────────────────────────────────────────────────────
// Job queue — single-process serial executor with concurrency=1
// ──────────────────────────────────────────────────────────────
// Keeps the implementation simple: one job at a time, others wait.
// Easy to swap for a real queue (BullMQ, etc.) later — the
// `enqueue` API is stable.
// ──────────────────────────────────────────────────────────────

import { jobStore } from "./job-store.js";
import { runWorkflow } from "../workflow/index.js";

class JobQueue {
  constructor() {
    this.queue = [];
    this.active = null;
    this.MAX_CONCURRENT = 1;
    this.MAX_QUEUE = 16;
  }

  enqueue(job) {
    if (this.queue.length >= this.MAX_QUEUE) {
      throw new Error("Job queue full — please try again later");
    }
    this.queue.push(job);
    this.drain();
    return job;
  }

  async drain() {
    if (this.active) return;
    if (this.queue.length === 0) return;
    const job = this.queue.shift();
    this.active = job;
    try {
      jobStore.setStatus(job.id, "running");
      await runWorkflow(job);
    } catch (err) {
      jobStore.setStatus(job.id, "failed", { error: err.message });
      jobStore.emit(job.id, {
        type: "error",
        message: err.message,
        stack: err.stack?.split("\n").slice(0, 5).join("\n"),
      });
    } finally {
      this.active = null;
      this.drain();
    }
  }

  status() {
    return {
      active: this.active?.id || null,
      pending: this.queue.map((j) => j.id),
      maxConcurrent: this.MAX_CONCURRENT,
      maxQueue: this.MAX_QUEUE,
    };
  }
}

export const jobQueue = new JobQueue();
