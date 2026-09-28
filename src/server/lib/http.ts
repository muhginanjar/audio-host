import type { Context } from "hono";

/**
 * Reverse-proxy-first IP resolution: x-forwarded-for → x-real-ip → socket.
 * (Deployments behind nginx/Caddy pass the real client in these headers.)
 */
export function requestIp(c: Context): string | null {
  const xff = c.req.header("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  const real = c.req.header("x-real-ip");
  if (real) return real.trim();
  // @hono/node-server binds the Node request as c.env.incoming; a generic
  // Context can't surface it, hence the narrow structural cast.
  const env = c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined;
  return env?.incoming?.socket?.remoteAddress ?? null;
}

export function requestUserAgent(c: Context): string | null {
  return c.req.header("user-agent") ?? null;
}

/** ULIDs are stored uppercase; URLs are matched case-insensitively. */
export function normalizeId(raw: string | undefined): string | null {
  if (!raw) return null;
  const id = raw.toUpperCase();
  return id.length === 26 ? id : null;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
