import { createMiddleware } from "hono/factory";
import { listCorsOrigins } from "../services/settings-service";

/**
 * Allow-listed CORS for /api/v1 only (brief §29). No origin allowed by default;
 * "*" only when the admin explicitly sets it. Server-to-server calls (curl,
 * PHP) send no Origin header and pass through untouched.
 */
export const corsForApi = createMiddleware(async (c, next) => {
  if (!c.req.path.startsWith("/api/v1")) return next();

  const origin = c.req.header("origin");
  const origins = listCorsOrigins();
  const wildcard = origins.includes("*");
  const allowed = !!origin && (wildcard || origins.includes(origin));

  if (c.req.method === "OPTIONS") {
    const headers: Record<string, string> = {
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Max-Age": "600",
    };
    if (allowed) {
      headers["Access-Control-Allow-Origin"] = wildcard ? "*" : origin!;
      if (!wildcard) headers["Access-Control-Allow-Credentials"] = "true";
    }
    return c.body(null, 204, headers);
  }

  if (allowed) {
    c.header("Access-Control-Allow-Origin", wildcard ? "*" : origin!);
    if (!wildcard) c.header("Vary", "Origin");
  }
  await next();
});
