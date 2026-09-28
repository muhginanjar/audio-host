export interface RateCheck {
  ok: boolean;
  limit: number;
  remaining: number;
  /** seconds until the window resets; 0 when ok */
  retryAfter: number;
}

/**
 * Fixed-window counter. In-memory: correct for the single pm2 process deployment.
 * Interface (check/reset by key) is the seam for a Redis adapter under multi-instance scaling.
 */
export class FixedWindowRateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  check(key: string, limit: number, windowMs: number, now = Date.now()): RateCheck {
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + windowMs });
      return { ok: true, limit, remaining: limit - 1, retryAfter: 0 };
    }
    if (bucket.count >= limit) {
      return {
        ok: false,
        limit,
        remaining: 0,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    bucket.count += 1;
    return { ok: true, limit, remaining: limit - bucket.count, retryAfter: 0 };
  }

  /** Shared key prefix used to lock out a specific credential (login fail counter). */
  reset(key: string) {
    this.buckets.delete(key);
  }

  sweep(now = Date.now()) {
    for (const [key, b] of this.buckets) if (b.resetAt <= now) this.buckets.delete(key);
  }
}
