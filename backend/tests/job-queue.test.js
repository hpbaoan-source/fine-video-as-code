// Job queue — enqueue / drain / error handling.
// The queue used to ship the raw error stack to every SSE client;
// these tests pin that only the message leaves the server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { JobQueue } from "../lib/job-queue.js";
import { jobStore } from "../lib/job-store.js";

function waitFor(predicate, timeoutMs = 2000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - started > timeoutMs) {
        return reject(new Error("timeout waiting for condition"));
      }
      setTimeout(tick, 10);
    };
    tick();
  });
}

test("job-queue: enqueue runs the job and drains the queue", async () => {
  const started = [];
  const queue = new JobQueue({
    runner: async (job) => {
      started.push(job.id);
      jobStore.setStatus(job.id, "completed", {
        outputFilename: "out.mp4",
        outputSize: 42,
        outputDurationMs: 1234,
        warnings: [],
      });
    },
  });

  const job = jobStore.create({ topic: "t" });
  queue.enqueue(job);
  await waitFor(() => job.status === "completed");

  assert.deepEqual(started, [job.id]);
  assert.equal(queue.active, null);
  assert.equal(queue.status().pending.length, 0);
});

test("job-queue: a failing job ends up failed and the error event has no stack", async () => {
  const queue = new JobQueue({
    runner: async () => {
      throw new Error("boom");
    },
  });

  const job = jobStore.create({ topic: "t" });
  const events = [];
  jobStore.subscribe(job.id, (e) => events.push(e));

  queue.enqueue(job);
  await waitFor(() => job.status === "failed");

  const errEvent = events.find((e) => e.type === "error");
  assert.ok(errEvent, "expected an error event");
  assert.equal(errEvent.message, "boom");
  // The stack contains internal paths — it must stay server-side.
  assert.equal(errEvent.stack, undefined);
  assert.equal(job.error, "boom");
});

test("job-queue: refuses to enqueue when the queue is full", () => {
  const queue = new JobQueue({
    runner: async () => {
      // never resolves — keeps the queue busy
      await new Promise(() => {});
    },
  });

  // The first job is taken by the runner, the next MAX_QUEUE jobs
  // fill the queue — the one after that must be refused.
  for (let i = 0; i <= queue.MAX_QUEUE; i++) {
    assert.doesNotThrow(() => queue.enqueue(jobStore.create({ topic: `t${i}` })));
  }
  assert.equal(queue.queue.length, queue.MAX_QUEUE);
  assert.throws(
    () => queue.enqueue(jobStore.create({ topic: "overflow" })),
    /queue full/i
  );
});

test("job-queue: stop() closes the queue and refuses new jobs", async () => {
  const queue = new JobQueue({ runner: async () => {} });
  await queue.stop(100);
  assert.throws(() => queue.enqueue(jobStore.create({ topic: "t" })), /shutting down/i);
});
