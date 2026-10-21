// ──────────────────────────────────────────────────────────────
// Job queue — single-process serial executor with concurrency=1
// ──────────────────────────────────────────────────────────────
// Keeps the implementation simple: one job at a time, others wait.
// Easy to swap for a real queue (BullMQ, etc.) later — the
// `enqueue` API is stable.
// ──────────────────────────────────────────────────────────────

import { jobStore } from "./job-store.js";
import { runWorkflow } from "../workflow/index.js";

export class JobQueue {
  /**
   * @param {object}   [opts]
   * @param {Function} [opts.runner] workflow runner (injectable for tests)
   */
  constructor({ runner = runWorkflow } = {}) {
    this.queue = [];
    this.active = null;
    this.MAX_CONCURRENT = 1;
    this.MAX_QUEUE = 16;
    this.runner = runner;
  }

  enqueue(job) {
    if (this.closed) {
      throw new Error("Server is shutting down — not accepting new jobs");
    }
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
      await this.runner(job);
    } catch (err) {
      jobStore.setStatus(job.id, "failed", { error: err.message });
      // The stack trace stays on the server — it contains internal
      // paths and source context that must not reach the browser.
      console.error(`[job-queue] job ${job.id} failed:`, err);
      jobStore.emit(job.id, {
        type: "error",
        message: err.message || "Job failed",
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

  /**
   * Stop accepting new jobs and wait for the running one to finish
   * (bounded by `timeoutMs`). Used by the shutdown hook.
   */
  async stop(timeoutMs = 10_000) {
    this.closed = true;
    this.queue.length = 0; // drop everything that did not start yet
    const deadline = Date.now() + timeoutMs;
    while (this.active && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return !this.active;
  }
}

export const jobQueue = new JobQueue();
