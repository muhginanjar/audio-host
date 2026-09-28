import { Hono } from "hono";
import { parseOrThrow, listQuerySchema } from "../lib/validation";
import { listAudios } from "../services/audio-service";
import { publicFeedStats } from "../services/stats-service";

/**
 * Public discovery API — no authentication required, public files only.
 * Powers the "/" playlist homepage for logged-out visitors (brief: homepage
 * shows all public audio). Private files can never appear here: listAudios
 * with a null scope hard-filters visibility='public'.
 */
export const publicApi = new Hono();

publicApi.get("/feed", (c) => {
  const q = parseOrThrow(listQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { dtos, meta } = listAudios(null, { ...q, perPage: q.per_page });
  // Email owner tidak boleh bocor ke publik (PII): tampilkan hanya id + nama.
  const safe = dtos.map(({ owner, ...rest }) => (owner ? { ...rest, owner: { id: owner.id, name: owner.name } } : rest));
  return c.json({ success: true, data: safe, meta });
});

publicApi.get("/feed/stats", (c) => c.json({ success: true, data: publicFeedStats() }));
