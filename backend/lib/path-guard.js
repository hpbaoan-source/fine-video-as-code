// Path-traversal guard for the per-job static file server.
// Given a `root` directory and a candidate file path, return true
// only if the resolved candidate is inside `root` after symlink
// and `..` resolution. Reject anything that escapes.

import path from "node:path";

export function isPathInside(root, candidate) {
  if (typeof root !== "string" || typeof candidate !== "string") return false;
  const rel = path.relative(root, candidate);
  if (rel === "") return true;
  if (rel.startsWith("..")) return false;
  if (path.isAbsolute(rel)) return false;
  return true;
}
