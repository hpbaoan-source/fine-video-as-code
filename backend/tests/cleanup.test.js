// Cleanup of per-job temp directories.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import { cleanupWorkDir } from "../lib/cleanup.js";

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
