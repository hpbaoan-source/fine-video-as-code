// Cleanup of per-job temp directories.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { cleanupWorkDir, cleanupAllExpiredJobs } from "../lib/cleanup.js";

test("cleanupWorkDir: removes a non-empty directory", async () => {
  const dir = path.join(process.cwd(), "tmp", "jobs", "test-job-1");
  await fs.mkdir(path.join(dir, "sub"), { recursive: true });
  await fs.writeFile(path.join(dir, "sub", "file.txt"), "hello", "utf8");
  await fs.writeFile(path.join(dir, "top.txt"), "world", "utf8");
  await cleanupWorkDir("test-job-1");
  await assert.rejects(() => fs.stat(dir));
});

test("cleanupWorkDir: is idempotent (no throw on missing dir)", async () => {
  // Should not throw even if the dir doesn't exist
  await cleanupWorkDir("does-not-exist-xyz");
  // Calling twice in a row should also be safe
  await cleanupWorkDir("does-not-exist-xyz");
});

test("cleanupAllExpiredJobs: keeps a workdir that is still in use", async () => {
  const root = path.join(process.cwd(), "tmp", "jobs-test");
  await fs.rm(root, { recursive: true, force: true });
  await fs.mkdir(path.join(root, "live-job"), { recursive: true });
  await fs.writeFile(path.join(root, "live-job", "frame-00000.png"), "x", "utf8");
  await fs.mkdir(path.join(root, "old-job"), { recursive: true });
  // Age the second directory so it looks idle.
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
  await fs.utimes(path.join(root, "old-job"), old, old);

  const removed = await cleanupAllExpiredJobs({ root, graceMs: 60 * 60 * 1000 });
  assert.equal(removed, 1);
  // The live job survives — a render is still writing into it.
  assert.ok((await fs.stat(path.join(root, "live-job"))).isDirectory());
  assert.rejects(() => fs.stat(path.join(root, "old-job")));
  await fs.rm(root, { recursive: true, force: true });
});
