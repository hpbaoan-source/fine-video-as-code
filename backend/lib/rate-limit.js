// ──────────────────────────────────────────────────────────────
// Tiny in-house rate limiter (no new dependency).
//
// A sliding window per client key. Used to keep a single misbehaving
// client from filling the render queue (one Chromium render at a
// time) — the API is otherwise open.
// ──────────────────────────────────────────────────────────────

export class RateLimiter {
  /**
   * @param {number} limit   max requests per window
   * @param {number} windowMs window length in milliseconds
   */
  constructor(limit = 3, windowMs = 60_000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map(); // key -> array of timestamps
  }

  /**
   * Register a hit for `key`.
   * Returns `{ allowed, remaining, retryAfterMs }`.
   */
  hit(key) {
    const now = Date.now();
    const times = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (times.length >= this.limit) {
      this.hits.set(key, times);
      const retryAfterMs = Math.max(0, this.windowMs - (now - times[0]));
      return { allowed: false, remaining: 0, retryAfterMs };
    }
    times.push(now);
    this.hits.set(key, times);
    return {
      allowed: true,
      remaining: Math.max(0, this.limit - times.length),
      retryAfterMs: 0,
    };
  }

  /** Drop entries that have no hits inside the current window. */
  prune() {
    const now = Date.now();
    for (const [key, times] of this.hits) {
      const live = times.filter((t) => now - t < this.windowMs);
      if (live.length === 0) this.hits.delete(key);
      else this.hits.set(key, live);
    }
  }

  reset() {
    this.hits.clear();
  }
}
