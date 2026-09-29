import type { Context } from "hono";
import { Hono } from "hono";
import { requireSession, type SessionEnv } from "../middleware/session-auth";
import { badRequest, notFound } from "../lib/errors";
import { normalizeId } from "../lib/http";
import { parseOrThrow, listQuerySchema, patchAudioSchema, changePasswordSchema } from "../lib/validation";
import {
  deleteAudio,
  folderChipFor,
  getAudioStats,
  getOwnedAudio,
  listAudios,
  toAudioDTO,
  updateAudio,
} from "../services/audio-service";
import { changePassword } from "../services/auth-service";
import { issueToken } from "../services/token-service";
import { publicFeedStats, userDashboard } from "../services/stats-service";
import { buildMeDTO, uploadAudioFromForm } from "./_helpers";
import type { AudioFileRow } from "../db/schema";

/** Session-authenticated JSON API that powers the SPA (not part of the public contract). */
export const clientUser = new Hono<SessionEnv>();

clientUser.use("*", requireSession);

clientUser.get("/me", (c) => c.json({ success: true, data: buildMeDTO(c.get("user")) }));

clientUser.get("/stats", (c) => c.json({ success: true, data: userDashboard(c.get("user").id) }));

clientUser.post("/profile/password", async (c) => {
  const user = c.get("user");
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const { current_password, new_password } = parseOrThrow(changePasswordSchema, body);
  await changePassword(user.id, current_password, new_password);
  return c.json({ success: true, data: { logout_required: true } });
});

clientUser.post("/profile/token/regenerate", (c) => {
  const user = c.get("user");
  const { raw } = issueToken(user.id, user.id);
  return c.json({ success: true, data: { token: raw } });
});

clientUser.post("/audio", async (c) => {
  const row = await uploadAudioFromForm(c.req, c.get("user"));
  return c.json({ success: true, data: toAudioDTO(row, undefined, folderChipFor(row)) }, 201);
});

clientUser.get("/feed", (c) => {
  const q = parseOrThrow(listQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { dtos, meta } = listAudios(null, { ...q, perPage: q.per_page });
  return c.json({ success: true, data: dtos, meta });
});

clientUser.get("/feed/stats", (c) => c.json({ success: true, data: publicFeedStats() }));

clientUser.get("/audio", (c) => {
  const q = parseOrThrow(listQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { dtos, meta } = listAudios(c.get("user").id, { ...q, perPage: q.per_page });
  return c.json({ success: true, data: dtos, meta });
});

clientUser.get("/audio/:id", (c) => {
  const audio = audioFromSession(c);
  return c.json({ success: true, data: { ...toAudioDTO(audio, undefined, folderChipFor(audio)), stats: getAudioStats(audio.id) } });
});

clientUser.patch("/audio/:id", async (c) => {
  const audio = audioFromSession(c);
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const patch = parseOrThrow(patchAudioSchema, body);
  return c.json({ success: true, data: toAudioDTO(updateAudio(audio.id, audio.userId, toAudioPatchInput(patch)), undefined, folderChipFor(getOwnedAudio(audio.id, audio.userId))) });
});

clientUser.delete("/audio/:id", async (c) => {
  const audio = audioFromSession(c);
  await deleteAudio(audio.id, audio.userId);
  return c.json({ success: true, data: { deleted: true, id: audio.id } });
});

function audioFromSession(c: Context<SessionEnv, string>): AudioFileRow {
  const id = normalizeId(c.req.param("id"));
  if (!id) throw notFound("Audio not found.");
  return getOwnedAudio(id, c.get("user").id);
}

/** Maps snake_case PATCH body to the service patch (null clears the folder). */
export function toAudioPatchInput(patch: { title?: string; description?: string; visibility?: "public" | "private"; folder_id?: string | null }): {
  title?: string;
  description?: string;
  visibility?: "public" | "private";
  folderId?: string | null;
} {
  return {
    ...(patch.title !== undefined ? { title: patch.title } : {}),
    ...(patch.description !== undefined ? { description: patch.description } : {}),
    ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
    ...(patch.folder_id !== undefined ? { folderId: patch.folder_id } : {}),
  };
}
