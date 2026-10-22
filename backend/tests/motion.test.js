// Motion & Easing unit tests
import { test } from "node:test";
import assert from "node:assert/strict";
import { Easing, lerp, clamp, seg } from "../lib/motion.js";

test("Easing curves: basic boundaries 0 and 1", () => {
  for (const [name, fn] of Object.entries(Easing)) {
    const at0 = fn(0);
    const at1 = fn(1);
    assert.ok(Math.abs(at0) < 0.001, `${name}(0) should be ~0, got ${at0}`);
    assert.ok(Math.abs(at1 - 1) < 0.001, `${name}(1) should be ~1, got ${at1}`);
  }
});

test("Easing.outBack: overshoots target", () => {
  const peak = Easing.outBack(0.7);
  assert.ok(peak > 1.0, `outBack(0.7) should overshoot > 1.0, got ${peak}`);
  assert.ok(Math.abs(Easing.outBack(1) - 1.0) < 0.001);
});

test("lerp: interpolates correctly", () => {
  assert.equal(lerp(10, 20, 0), 10);
  assert.equal(lerp(10, 20, 0.5), 15);
  assert.equal(lerp(10, 20, 1), 20);
});

test("clamp: restricts to range", () => {
  assert.equal(clamp(5, 10, 20), 10);
  assert.equal(clamp(15, 10, 20), 15);
  assert.equal(clamp(25, 10, 20), 20);
});

test("seg: segments progress window", () => {
  assert.equal(seg(0.1, 0.2, 0.6), 0);
  assert.ok(Math.abs(seg(0.4, 0.2, 0.6) - 0.5) < 0.0001);
  assert.equal(seg(0.8, 0.2, 0.6), 1);
});
