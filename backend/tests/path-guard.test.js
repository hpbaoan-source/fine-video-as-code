// Path-traversal guard for the per-job static file server.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  isPathInside,
  isPathInsideResolved,
  resolveInside,
  realpathOrSelf,
} from "../lib/path-guard.js";

test("isPathInside: same root", () => {
  assert.equal(isPathInside("/srv/templates", "/srv/templates/tech.html"), true);
  assert.equal(isPathInside("/srv/templates", "/srv/templates"), true);
});

test("isPathInside: rejects .. escapes", () => {
  assert.equal(isPathInside("/srv/templates", "/srv/templates/../../../etc/passwd"), false);
  assert.equal(isPathInside("/srv/templates", "/srv/../etc"), false);
});

test("isPathInside: rejects absolute paths outside root", () => {
  assert.equal(isPathInside("/srv/templates", "/etc/passwd"), false);
});

test("isPathInside: rejects when names only share a prefix (Windows attack)", () => {
  // /srv/templates-evil must not pass /srv/templates prefix check.
  // This is the bug that `filePath.startsWith(root)` has on every
  // platform — and worse on Windows where `D:\templates` and
  // `D:\templates-evil` are different folders but startsWith agrees.
  assert.equal(isPathInside("D:\\templates", "D:\\templates-evil\\hack"), false);
  assert.equal(isPathInside("/srv/templates", "/srv/templates-evil/hack"), false);
});

test("isPathInside: rejects non-string args", () => {
  assert.equal(isPathInside(null, "/x"), false);
  assert.equal(isPathInside("/x", undefined), false);
  assert.equal(isPathInside(123, "/x"), false);
});

test("resolveInside: returns the absolute path for a file inside the root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "finevideo-guard-"));
  await fs.writeFile(path.join(root, "a.json"), "{}", "utf8");
  const resolved = resolveInside(root, "a.json");
  assert.equal(resolved, path.join(root, "a.json"));
});

test("resolveInside: rejects traversal and absolute paths outside the root", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "finevideo-guard-"));
  assert.equal(resolveInside(root, "../escape.json"), null);
  assert.equal(resolveInside(root, "/etc/passwd"), null);
  assert.equal(resolveInside(root, ""), null);
  assert.equal(resolveInside(root, root), null, "the root itself is not a file");
});

test("isPathInsideResolved: a symlink pointing outside the root is rejected", async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), "finevideo-symlink-"));
  const root = path.join(base, "root");
  const outside = path.join(base, "outside");
  await fs.mkdir(root);
  await fs.mkdir(outside);
  await fs.writeFile(path.join(outside, "secret.txt"), "secret", "utf8");
  const link = path.join(root, "link.txt");
  try {
    await fs.symlink(path.join(outside, "secret.txt"), link);
  } catch {
    return; // symlinks are not available on this platform
  }

  // The lexical check alone would pass — the symlink is inside
  // the root path-wise.
  assert.equal(isPathInside(root, link), true);
  // The realpath-aware check must reject it.
  assert.equal(await isPathInsideResolved(root, link), false);
  // A regular file inside the root is still fine.
  await fs.writeFile(path.join(root, "ok.txt"), "ok", "utf8");
  assert.equal(await isPathInsideResolved(root, path.join(root, "ok.txt")), true);
});

test("realpathOrSelf: falls back to the resolved path for missing files", async () => {
  const missing = path.join(os.tmpdir(), "finevideo-does-not-exist-xyz");
  assert.equal(await realpathOrSelf(missing), path.resolve(missing));
});
