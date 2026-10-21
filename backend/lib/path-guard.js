// Path-traversal guard for the per-job static file server and for
// user-supplied file paths (preset scripts).
//
// Given a `root` directory and a candidate file path, return true
// only if the resolved candidate is inside `root` after symlink
// and `..` resolution. Reject anything that escapes.
//
// Two flavours:
//   • isPathInside(root, candidate)      — sync, lexical check
//   • isPathInsideResolved(root, cand.)  — async, resolves symlinks
//                                          with fs.realpath first
// The async one is what the static server uses: a symlink inside
// the served root that points outside of it must not be served.

import path from "node:path";
import fs from "node:fs/promises";

export function isPathInside(root, candidate) {
  if (typeof root !== "string" || typeof candidate !== "string") return false;
  // A Windows-style path ("D:\\templates") is compared with win32
  // semantics even when the check runs on Linux, so the guard
  // behaves the same on every platform.
  const windows = /^[A-Za-z]:[\\/]/.test(root) || /^[A-Za-z]:[\\/]/.test(candidate);
  const p = windows ? path.win32 : path.posix;
  const absRoot = p.resolve(root);
  const abs = p.resolve(absRoot, candidate);
  if (abs === absRoot) return true;
  // Compare against the root *plus* a separator: a sibling such as
  // "/srv/templates-evil" must not pass a "/srv/templates" check.
  const sep = windows ? "\\" : "/";
  const rootWithSep = absRoot.endsWith(sep) ? absRoot : absRoot + sep;
  return abs.startsWith(rootWithSep);
}

/**
 * Resolve `candidate` against `root` and return the absolute path
 * only when it stays inside `root`. Returns null otherwise.
 * Used for user-supplied paths (e.g. `presetScript`).
 */
export function resolveInside(root, candidate) {
  if (typeof root !== "string" || typeof candidate !== "string" || candidate.length === 0) {
    return null;
  }
  const absRoot = path.resolve(root);
  const abs = path.resolve(absRoot, candidate);
  if (abs === absRoot) return null; // the root itself is not a file
  if (!isPathInside(absRoot, abs)) return null;
  return abs;
}

/** fs.realpath with a graceful fallback for missing paths. */
export async function realpathOrSelf(p) {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

/**
 * Symlink-aware containment check: resolves both root and candidate
 * to their real paths (so a symlink pointing outside the root is
 * rejected) and then compares them lexically.
 */
export async function isPathInsideResolved(root, candidate) {
  if (typeof root !== "string" || typeof candidate !== "string") return false;
  const realRoot = await realpathOrSelf(path.resolve(root));
  const realCandidate = await realpathOrSelf(path.resolve(realRoot, candidate));
  return isPathInside(realRoot, realCandidate);
}
