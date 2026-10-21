// Viewport / output size derived from resolution + aspect ratio.
import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveViewport, sizeArg } from "../lib/video-size.js";

test("resolveViewport: 16:9 keeps the documented sizes", () => {
  assert.deepEqual(resolveViewport("480p", "16:9"), { width: 854, height: 480 });
  assert.deepEqual(resolveViewport("720p", "16:9"), { width: 1280, height: 720 });
  assert.deepEqual(resolveViewport("1080p", "16:9"), { width: 1920, height: 1080 });
  assert.deepEqual(resolveViewport("1440p", "16:9"), { width: 2560, height: 1440 });
  assert.deepEqual(resolveViewport("2160p", "16:9"), { width: 3840, height: 2160 });
});

test("resolveViewport: portrait swaps the axes", () => {
  assert.deepEqual(resolveViewport("1080p", "9:16"), { width: 1080, height: 1920 });
  assert.deepEqual(resolveViewport("720p", "9:16"), { width: 720, height: 1280 });
});

test("resolveViewport: 1:1 is square", () => {
  assert.deepEqual(resolveViewport("1080p", "1:1"), { width: 1080, height: 1080 });
});

test("resolveViewport: 4:3 widens the frame", () => {
  assert.deepEqual(resolveViewport("1080p", "4:3"), { width: 1440, height: 1080 });
});

test("resolveViewport: unknown values fall back to 1080p 16:9", () => {
  assert.deepEqual(resolveViewport("8k", "21:9"), { width: 1920, height: 1080 });
  assert.deepEqual(resolveViewport(undefined, undefined), { width: 1920, height: 1080 });
});

test("resolveViewport: every size is even (h264 requirement)", () => {
  for (const res of ["480p", "720p", "1080p", "1440p", "2160p"]) {
    for (const ratio of ["16:9", "9:16", "1:1", "4:3"]) {
      const { width, height } = resolveViewport(res, ratio);
      assert.equal(width % 2, 0, `${res} ${ratio} → width ${width} is odd`);
      assert.equal(height % 2, 0, `${res} ${ratio} → height ${height} is odd`);
    }
  }
});

test("sizeArg: renders the ffmpeg -s value", () => {
  assert.equal(sizeArg({ width: 1920, height: 1080 }), "1920x1080");
  assert.equal(sizeArg({ width: 1080, height: 1920 }), "1080x1920");
});
