// Path-traversal guard for the per-job static file server.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPathInside } from "../lib/path-guard.js";

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
