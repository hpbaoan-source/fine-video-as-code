// Job store — TTL, GC of non-terminal jobs, terminal event payload.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { JobStore } from "../lib/job-store.js";

const JOBS_ROOT = path.join(process.cwd(), "tmp", "jobs");

test("job-store: the complete event carries the result payload", () => {
  const store = new JobStore();
  const job = store.create({ topic: "t" });
  const events = [];
  store.subscribe(job.id, (e) => events.push(e));

  store.setStatus(job.id, "completed", {
    outputFilename: "video.mp4",
    outputSize: 2048,
    outputDurationMs: 4321,
    warnings: ["tts_failed:scene-2"],
  });

  const complete = events.find((e) => e.type === "complete");
  assert.ok(complete, "expected a complete event");
  assert.equal(complete.filename, "video.mp4");
  assert.equal(complete.size, 2048);
  assert.equal(complete.duration_ms, 4321);
  assert.equal(complete.downloadUrl, `/api/download/${job.id}`);
  assert.deepEqual(complete.warnings, ["tts_failed:scene-2"]);
});

test("job-store: the failed event carries the error message", () => {
  const store = new JobStore();
  const job = store.create({ topic: "t" });
  const events = [];
  store.subscribe(job.id, (e) => events.push(e));

  store.setStatus(job.id, "failed", { error: "kaputt" });

  const failed = events.find((e) => e.type === "failed");
  assert.ok(failed);
  assert.equal(failed.message, "kaputt");
});

test("job-store: gc() expires a completed job and removes its work dir", async () => {
  const store = new JobStore();
  const job = store.create({ topic: "t" });
  const workDir = path.join(JOBS_ROOT, job.id);
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(path.join(workDir, "x.txt"), "x", "utf8");

  store.setStatus(job.id, "completed", { outputFilename: "a.mp4" });
  // Backdate the completion so the job is past its TTL.
  job.completedAt = Date.now() - store.TTL_MS - 1000;

  await store.gc();

  assert.equal(job.status, "expired");
  await assert.rejects(() => fs.stat(workDir), "work dir should be removed");
});

test("job-store: gc() expires a job that never reached a terminal state", async () => {
  const store = new JobStore();
  const job = store.create({ topic: "t" });
  const workDir = path.join(JOBS_ROOT, job.id);
  await fs.mkdir(workDir, { recursive: true });

  // The job is still "queued" — it must not live forever.
  job.createdAt = Date.now() - store.MAX_AGE_MS - 1000;

  await store.gc();

  assert.equal(job.status, "expired");
  await assert.rejects(() => fs.stat(workDir), "work dir should be removed");
});

test("job-store: gc() keeps fresh jobs", () => {
  const store = new JobStore();
  const job = store.create({ topic: "t" });
  store.gc();
  assert.equal(job.status, "queued");
  assert.equal(store.get(job.id).id, job.id);
});

test("job-store: remove() drops the job completely", () => {
  const store = new JobStore();
  const job = store.create({ topic: "t" });
  assert.equal(store.remove(job.id), true);
  assert.equal(store.get(job.id), null);
  assert.equal(store.remove(job.id), false);
});
