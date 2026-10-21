// Download route helpers — Content-Disposition with non-ASCII names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentDisposition } from "../routes/download.js";

test("contentDisposition: plain ascii name", () => {
  const header = contentDisposition("video.mp4");
  assert.match(header, /^attachment; filename="video\.mp4"/);
  assert.match(header, /filename\*=UTF-8''video\.mp4/);
});

test("contentDisposition: non-ascii names get a percent-encoded filename*", () => {
  const name = "Hướng dẫn Git.mp4";
  const header = contentDisposition(name);
  assert.match(header, /filename="[^"]*"/);
  assert.match(header, /filename\*=UTF-8''/);
  const encoded = header.match(/filename\*=UTF-8''([^"]+)/)[1];
  assert.equal(decodeURIComponent(encoded), name);
  // The legacy parameter must stay pure ASCII.
  const legacy = header.match(/filename="([^"]*)"/)[1];
  assert.ok(/^[\x20-\x7E]*$/.test(legacy), "legacy filename must be ascii");
});

test("contentDisposition: strips CR/LF (header injection)", () => {
  const header = contentDisposition("evil\r\nSet-Cookie: a=b.mp4");
  assert.ok(!/[\r\n]/.test(header), "no CR/LF may survive");
});

test("contentDisposition: quotes and backslashes are neutralised", () => {
  const header = contentDisposition('a"b\\c.mp4');
  assert.match(header, /filename="a_b_c\.mp4"/);
});
