// Best-effort cleanup of per-job temp directories under tmp/jobs/.
// Kept in its own module to avoid a circular import between
// job-store.js and workflow/index.js.
import fs from "node:fs/promises";
import path from "node:path";
import { JOBS_ROOT } from "./paths.js";

export async function cleanupWorkDir(jobId) {
  const workDir = path.join(JOBS_ROOT, jobId);
  await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
}

// A render keeps writing into its workdir (frames, audio, the
// final MP4), so a directory that was touched recently is still in
// use. Only directories that have been idle for longer than the
// grace period are removed — otherwise stopping one server instance
// wipes the frames of a render that another process (the CLI, a
// second instance) is still writing, and the encode fails with
// "Could find no file with path frame-%05d.png".
const IDLE_GRACE_MS = 2 * 60 * 60 * 1000; // 2 h

export async function cleanupAllExpiredJobs({
  root = JOBS_ROOT,
  graceMs = IDLE_GRACE_MS,
} = {}) {
  // Used at server shutdown — walk tmp/jobs and remove anything
  // that is not a recent (in-use) directory.
  let entries = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    const workDir = path.join(root, entry);
    const stat = await fs.stat(workDir).catch(() => null);
    if (!stat?.isDirectory()) continue;
    // Freshly touched → a render may still be writing here.
    if (Date.now() - stat.mtimeMs < graceMs) continue;
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
    removed++;
  }
  return removed;
}
