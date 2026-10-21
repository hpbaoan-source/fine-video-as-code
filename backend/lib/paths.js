// ──────────────────────────────────────────────────────────────
// Shared filesystem locations.
//
// The temp root used to be computed independently in
// `lib/cleanup.js` and `workflow/index.js`, both from
// `process.cwd()` at import time. If the cwd changed between the
// two imports the cleanup path silently diverged from the render
// path. Both modules now import the same constant from here.
// ──────────────────────────────────────────────────────────────

import path from "node:path";

// Root of all per-job working directories: <cwd>/tmp/jobs/<jobId>
export const TMP_ROOT = path.join(process.cwd(), "tmp");
export const JOBS_ROOT = path.join(TMP_ROOT, "jobs");

// Path of a single job's working directory.
export function jobWorkDir(jobId) {
  return path.join(JOBS_ROOT, jobId);
}
