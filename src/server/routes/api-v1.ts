import type { Context } from "hono";
import { Hono } from "hono";
import { performance } from "node:perf_hooks";
import { requireApiToken, type ApiEnv } from "../middleware/api-auth";
import { rateLimit } from "../middleware/rate-limit";
import { badRequest, noFileProvided, notFound } from "../lib/errors";
import { normalizeId, requestIp, requestUserAgent } from "../lib/http";
import { parseOrThrow, listQuerySchema, patchAudioSchema } from "../lib/validation";
import {
  deleteAudio,
  getAudioStats,
  folderChipFor,
  getOwnedAudio,
  listAudios,
  toAudioDTO,
  updateAudio,
  uploadAudio,
} from "../services/audio-service";
import { logApiRequest } from "../services/api-log-service";
import { buildMeDTO, uploadAudioFromForm } from "./_helpers";
import { toAudioPatchInput } from "./client-user";
import type { AudioFileRow } from "../db/schema";
export const apiV1 = new Hono<ApiEnv>();

/** Every /api/v1 request is logged (success or failure) with timing. */
apiV1.use("*", async (c, next) => {
  const started = performance.now();
  await next();
  logApiRequest({
    userId: c.get("apiUser")?.id ?? null,
    apiTokenId: c.get("apiToken")?.id ?? null,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    statusCode: c.res.status,
    ip: requestIp(c),
    userAgent: requestUserAgent(c),
    responseTimeMs: Math.round(performance.now() - started),
  });
});

apiV1.use("*", requireApiToken);
apiV1.use("*", rateLimit("general"));

apiV1.get("/me", (c) => c.json({ success: true, data: buildMeDTO(c.get("apiUser")) }));

apiV1.post("/audio", rateLimit("upload"), async (c) => {
  const row = await uploadAudioFromForm(c.req, c.get("apiUser"));
  return c.json({ success: true, data: toAudioDTO(row, undefined, folderChipFor(row)) }, 201);
});

apiV1.get("/audio", (c) => {
  const q = parseOrThrow(listQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { dtos, meta } = listAudios(c.get("apiUser").id, { ...q, perPage: q.per_page });
  return c.json({ success: true, data: dtos, meta });
});

apiV1.get("/audio/:id", (c) => {
  const audio = audioFromParam(c);
  return c.json({ success: true, data: { ...toAudioDTO(audio, undefined, folderChipFor(audio)), stats: getAudioStats(audio.id) } });
});

apiV1.patch("/audio/:id", async (c) => {
  const audio = audioFromParam(c);
  const raw: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const patch = parseOrThrow(patchAudioSchema, raw);
  return c.json({ success: true, data: toAudioDTO(updateAudio(audio.id, audio.userId, toAudioPatchInput(patch)), undefined, folderChipFor(getOwnedAudio(audio.id, audio.userId))) });
});

apiV1.delete("/audio/:id", async (c) => {
  const audio = audioFromParam(c);
  await deleteAudio(audio.id, audio.userId);
  return c.json({ success: true, data: { deleted: true, id: audio.id } });
});
/** Resolves + owner-scopes the :id param — foreign ids behave exactly like missing ones. */
function audioFromParam(c: Context<ApiEnv, string>): AudioFileRow {
  const id = normalizeId(c.req.param("id"));
  if (!id) throw notFound(`Audio "${c.req.param("id") ?? ""}" was not found in this account.`);
  return getOwnedAudio(id, c.get("apiUser").id);
}
