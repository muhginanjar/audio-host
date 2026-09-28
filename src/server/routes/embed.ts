import { Hono } from "hono";
import { escapeHtml, normalizeId } from "../lib/http";
import { getAudioById } from "../services/audio-service";
import { getDb } from "../db";
import { users } from "../db/schema";
import { eq } from "drizzle-orm";
import { env } from "../env";

export const embed = new Hono();

/**
 * Minimal, responsive, iframe-safe player (brief §7). Server-rendered,
 * zero JavaScript, works on WordPress/LMS/static sites. CSP allows framing
 * from any ancestor; everything else locked down.
 */
embed.get("/:id", (c) => {
  const id = normalizeId(c.req.param("id"));
  const audio = id ? getAudioById(id) : null;

  if (!audio) {
    return c.html(page("Audio not found", `<p class="err">This audio is not available (id ${escapeHtml(c.req.param("id") ?? "")}).</p>`), 404, embedHeaders());
  }
  if (audio.visibility !== "public") {
    return c.html(page("Private audio", '<p class="err">This audio is private.</p>'), 403, embedHeaders());
  }

  const owner = getDb()
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, audio.userId))
    .get();

  const subtitle = [audio.artist, owner?.name].filter(Boolean).join(" · ");
  const body = `
    <div class="meta">
      <div class="title" title="${escapeHtml(audio.title)}">${escapeHtml(audio.title)}</div>
      ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ""}
    </div>
    <audio controls preload="metadata">
      <source src="${escapeHtml(audio.publicUrl)}" type="${escapeHtml(audio.mimeType)}">
      Your browser does not support embedded audio.
      <a href="${escapeHtml(audio.publicUrl)}">Download</a>
    </audio>`;

  return c.html(page(audio.title, body), 200, embedHeaders());
});

function embedHeaders(): Record<string, string> {
  return {
    "Content-Security-Policy": `default-src 'none'; media-src 'self' ${env.appUrl}; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'`,
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
  };
}

function page(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
         background: #ffffff; color: #0f172a; }
  @media (prefers-color-scheme: dark) { body { background: #0b1120; color: #e2e8f0; } }
  .wrap { display: flex; flex-direction: column; gap: 8px; padding: 10px 12px; }
  .meta { display: flex; align-items: baseline; gap: 8px; min-width: 0; }
  .title { font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font-size: 11px; opacity: .6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  audio { width: 100%; height: 36px; }
  .err { font-size: 13px; margin: 0; opacity: .7; }
</style>
</head>
<body><div class="wrap">${body}</div></body>
</html>`;
}
