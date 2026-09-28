import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { env } from "../env";
import { SESSION_COOKIE } from "../middleware/session-auth";
import { AppError, badRequest, unauthorized } from "../lib/errors";
import { loginSchema, parseOrThrow } from "../lib/validation";
import { FixedWindowRateLimiter } from "../lib/ratelimit";
import { requestIp, requestUserAgent } from "../lib/http";
import {
  createSession,
  destroySession,
  recordLogin,
  verifyCredentials,
} from "../services/auth-service";
import { buildMeDTO } from "./_helpers";

export const clientAuth = new Hono();

const loginLimiter = new FixedWindowRateLimiter();

clientAuth.post("/login", async (c) => {
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const { email, password } = parseOrThrow(loginSchema, body);

  const ip = requestIp(c);
  const check = loginLimiter.check(`login:${ip ?? "?"}:${email.toLowerCase()}`, 10, 15 * 60_000);
  if (!check.ok) {
    throw new AppError("RATE_LIMITED", "Too many login attempts. Try again in a few minutes.", {
      headers: { "Retry-After": String(check.retryAfter) },
    });
  }

  const user = await verifyCredentials(email, password);
  if (!user) {
    // Identical response for wrong email, wrong password, and disabled account.
    throw unauthorized("Invalid email or password.");
  }

  const issue = await createSession(user.id, ip, requestUserAgent(c));
  recordLogin(user.id);
  setCookie(c, SESSION_COOKIE, issue.secret, {
    path: "/",
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "Lax",
    expires: new Date(issue.expiresAt),
  });
  return c.json({ success: true, data: buildMeDTO(user) });
});

clientAuth.post("/logout", (c) => {
  const secret = getCookie(c, SESSION_COOKIE);
  if (secret) destroySession(secret);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ success: true, data: { loggedOut: true } });
});
