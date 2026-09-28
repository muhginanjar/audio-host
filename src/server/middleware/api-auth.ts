import { createMiddleware } from "hono/factory";
import type { ApiTokenRow, UserRow } from "../db/schema";
import { AppError, unauthorized } from "../lib/errors";
import { resolveToken, touchToken } from "../services/token-service";

export type ApiEnv = { Variables: { apiUser: UserRow; apiToken: ApiTokenRow } };

export const requireApiToken = createMiddleware<ApiEnv>(async (c, next) => {
  const header = c.req.header("authorization")?.trim() ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  if (!match) {
    throw unauthorized("Missing API token. Send header: Authorization: Bearer aud_<your-token>");
  }
  const principal = resolveToken(match[1]);
  if (!principal) {
    // One uniform message: no hints about existence, revocation, or disabled status.
    throw new AppError("TOKEN_REVOKED", "Invalid or revoked API token.");
  }
  c.set("apiUser", principal.user);
  c.set("apiToken", principal.token);
  touchToken(principal.token.id);
  await next();
});
