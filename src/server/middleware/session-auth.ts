import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import type { UserRow } from "../db/schema";
import { resolveSession } from "../services/auth-service";
import { forbidden, unauthorized } from "../lib/errors";

export const SESSION_COOKIE = "sid";

export type SessionEnv = { Variables: { user: UserRow; sessionId: string } };

export const requireSession = createMiddleware<SessionEnv>(async (c, next) => {
  const secret = getCookie(c, SESSION_COOKIE);
  if (!secret) throw unauthorized("Please log in.");
  const principal = resolveSession(secret);
  if (!principal) throw unauthorized("Your session has expired. Please log in again.");
  c.set("user", principal.user);
  c.set("sessionId", principal.sessionId);
  await next();
});

export const requireAdmin = createMiddleware<SessionEnv>(async (c, next) => {
  const user = c.get("user");
  if (user.role !== "admin") throw forbidden("Administrator access required.");
  await next();
});
