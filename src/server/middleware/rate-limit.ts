import { createMiddleware } from "hono/factory";
import { AppError } from "../lib/errors";
import { FixedWindowRateLimiter } from "../lib/ratelimit";
import { getSettings } from "../services/settings-service";
import type { ApiEnv } from "./api-auth";

/** Shared limiter; sweep runs from index.ts. Interface allows a Redis swap for multi-instance. */
export const apiLimiter = new FixedWindowRateLimiter();

const MINUTE = 60_000;

/** Run AFTER requireApiToken — buckets keyed by token id (not raw token, not user id). */
export function rateLimit(scope: "general" | "upload") {
  return createMiddleware<ApiEnv>(async (c, next) => {
    const settings = getSettings();
    const limit = scope === "upload" ? settings.upload_rate_limit_per_minute : settings.api_rate_limit_per_minute;
    const result = apiLimiter.check(`${scope}:${c.get("apiToken").id}`, limit, MINUTE);
    c.header("X-RateLimit-Limit", String(limit));
    c.header("X-RateLimit-Remaining", String(result.remaining));
    if (!result.ok) {
      throw new AppError("RATE_LIMITED", `Rate limit reached (${limit} ${scope === "upload" ? "uploads" : "requests"} per minute). Try again in ${result.retryAfter}s.`, {
        headers: { "Retry-After": String(result.retryAfter) },
      });
    }
    await next();
  });
}
