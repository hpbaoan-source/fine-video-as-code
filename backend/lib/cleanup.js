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

export async function cleanupAllExpiredJobs() {
  // Used at server shutdown — walk tmp/jobs and remove anything
  // that isn't a known live job.
  let entries = [];
  try {
    entries = await fs.readdir(JOBS_ROOT);
  } catch {
    return 0;
  }
  let removed = 0;
  for (const entry of entries) {
    const workDir = path.join(JOBS_ROOT, entry);
    const stat = await fs.stat(workDir).catch(() => null);
    if (stat?.isDirectory()) {
      await fs.rm(workDir, { recursive: true, force: true }).catch(() => {});
      removed++;
    }
  }
  return removed;
}
