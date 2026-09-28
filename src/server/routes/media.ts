import type { Context } from "hono";
import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { AppError, forbidden, notFound } from "../lib/errors";
import { parseRange } from "../lib/ranges";
import { normalizeId, requestIp, requestUserAgent } from "../lib/http";
import { getAudioById, recordAccess } from "../services/audio-service";
import { resolveSession } from "../services/auth-service";
import { getStorage } from "../storage";

export const media = new Hono();

type MediaContext = Context;

const YEAR = "public, max-age=31536000, immutable";

function disposition(filename: string, download: boolean): string {
  return `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

async function handleServe(c: MediaContext, withBody: boolean): Promise<Response> {
  const id = normalizeId(c.req.param("id"));
  if (!id) throw notFound("Audio not found.");
  const audio = getAudioById(id);
  if (!audio) throw notFound("Audio not found.");

  // Authorization on every delivery (brief §15): public files stream freely;
  // private files stream only for their owner (session) — signed URLs are Phase 3.
  if (audio.visibility !== "public") {
    const secret = getCookie(c, "sid");
    const principal = secret ? resolveSession(secret) : null;
    if (!principal || principal.user.id !== audio.userId) {
      throw forbidden("This audio file is private. Signed URLs are not enabled on this deployment.");
    }
  }

  const ip = requestIp(c);
  const ua = requestUserAgent(c);
  const referer = c.req.header("referer") ?? null;

  const storage = getStorage();
  const st = await storage.stat(audio.storagePath);
  if (!st) {
    recordAccess(audio.id, { statusCode: 404, ip, referer, userAgent: ua, countPlay: false });
    throw notFound("The stored audio file is missing from the storage backend.");
  }

  const rangeHeader = c.req.header("range");
  const range = parseRange(rangeHeader, st.size);
  const baseHeaders: Record<string, string> = {
    "Content-Type": audio.mimeType,
    "Accept-Ranges": "bytes",
    "Cache-Control": YEAR,
    "Content-Disposition": disposition(audio.originalFilename, c.req.query("dl") === "1"),
    "X-Robots-Tag": "noindex, nofollow",
  };

  if (range.mode === "unsatisfiable") {
    recordAccess(audio.id, { statusCode: 416, ip, referer, userAgent: ua, countPlay: false });
    return c.body(null, 416, { ...baseHeaders, "Content-Range": `bytes */${st.size}` });
  }

  const isPartial = range.mode === "partial";
  const status = isPartial ? 206 : 200;
  const headers: Record<string, string> = { ...baseHeaders };
  if (isPartial) {
    const { start, end } = range.slice;
    headers["Content-Range"] = `bytes ${start}-${end}/${st.size}`;
    headers["Content-Length"] = String(end - start + 1);
  } else {
    headers["Content-Length"] = String(st.size);
  }

  // A "play" counts as one full non-Range delivery — seek traffic doesn't inflate stats.
  recordAccess(audio.id, { statusCode: status, ip, referer, userAgent: ua, countPlay: !isPartial && !rangeHeader });

  if (!withBody) return c.body(null, status, headers);

  const body = await storage.open(audio.storagePath, isPartial ? { start: range.slice.start, end: range.slice.end } : undefined);
  if (!body) {
    throw new AppError("NOT_FOUND", "The stored audio file is missing from the storage backend.");
  }
  return c.body(body, status, headers);
}

media.get("/:id", (c) => handleServe(c, true));
media.on("HEAD", "/:id", (c) => handleServe(c, false));
