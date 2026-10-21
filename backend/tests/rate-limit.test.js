// In-house rate limiter used by POST /api/generate.
import { test } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../lib/rate-limit.js";

test("RateLimiter: allows up to the limit, then blocks", () => {
  const limiter = new RateLimiter(3, 60_000);
  assert.equal(limiter.hit("1.2.3.4").allowed, true);
  assert.equal(limiter.hit("1.2.3.4").allowed, true);
  const third = limiter.hit("1.2.3.4");
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);
  const fourth = limiter.hit("1.2.3.4");
  assert.equal(fourth.allowed, false);
  assert.ok(fourth.retryAfterMs > 0);
});

test("RateLimiter: clients are counted separately", () => {
  const limiter = new RateLimiter(1, 60_000);
  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("b").allowed, true);
  assert.equal(limiter.hit("a").allowed, false);
});

test("RateLimiter: the window slides", async () => {
  const limiter = new RateLimiter(1, 40);
  assert.equal(limiter.hit("a").allowed, true);
  assert.equal(limiter.hit("a").allowed, false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(limiter.hit("a").allowed, true);
});

test("RateLimiter: prune() drops idle clients", async () => {
  const limiter = new RateLimiter(2, 30);
  limiter.hit("a");
  await new Promise((r) => setTimeout(r, 50));
  limiter.prune();
  assert.equal(limiter.hits.size, 0);
});
