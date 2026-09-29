import type { Context } from "hono";
import { Hono } from "hono";
import { requireSession, type SessionEnv } from "../middleware/session-auth";
import { badRequest, notFound } from "../lib/errors";
import { normalizeId } from "../lib/http";
import {
  createFolderSchema,
  folderListQuerySchema,
  parseOrThrow,
  patchFolderSchema,
} from "../lib/validation";
import {
  createFolder,
  deleteFolder,
  folderCounts,
  folderTracksScoped,
  getOwnedFolder,
  listFolders,
  toFolderDTO,
  updateFolder,
} from "../services/folder-service";
import { deleteAudio as deleteTrackAudio, getAudioById } from "../services/audio-service";

/** Owner-scoped folders for the SPA dashboard (session auth). */
export const clientFolders = new Hono<SessionEnv>();

clientFolders.use("*", requireSession);

clientFolders.get("/", (c) => {
  const q = parseOrThrow(folderListQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { dtos, meta } = listFolders(c.get("user").id, {
    search: q.search,
    visibility: q.visibility,
    showOnHomepage: q.show_on_homepage,
    page: q.page,
    perPage: q.per_page,
  });
  return c.json({ success: true, data: dtos, meta });
});

clientFolders.post("/", async (c) => {
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const input = parseOrThrow(createFolderSchema, body);
  const row = createFolder(c.get("user").id, {
    name: input.name,
    visibility: input.visibility,
    showOnHomepage: input.show_on_homepage,
  });
  return c.json({ success: true, data: toFolderDTO(row, folderCounts(row.id)) }, 201);
});

clientFolders.get("/:id", (c) => {
  const folder = folderFromSession(c);
  const q = parseOrThrow(folderListQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { dtos, meta } = folderTracksScoped({ folderId: folder.id, userId: folder.userId, onlyPublic: false, page: q.page, perPage: q.per_page });
  return c.json({
    success: true,
    data: { folder: toFolderDTO(folder, folderCounts(folder.id)), tracks: dtos, meta },
  });
});

clientFolders.patch("/:id", async (c) => {
  const folder = folderFromSession(c);
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const patch = parseOrThrow(patchFolderSchema, body);
  const row = updateFolder(folder.id, folder.userId, {
    name: patch.name,
    visibility: patch.visibility,
    showOnHomepage: patch.show_on_homepage,
  });
  return c.json({ success: true, data: toFolderDTO(row, folderCounts(row.id)) });
});

clientFolders.delete("/:id", async (c) => {
  const folder = folderFromSession(c);
  const deleteContents = new URL(c.req.url).searchParams.get("delete_contents") === "true";
  if (deleteContents) {
    const { dtos } = folderTracksScoped({ folderId: folder.id, userId: folder.userId, onlyPublic: false, page: 1, perPage: 1000 });
    for (const t of dtos) {
      const row = getAudioById(t.id);
      if (row && row.userId === folder.userId) await deleteTrackAudio(t.id, folder.userId);
    }
  }
  const result = deleteFolder(folder.id, folder.userId, false);
  return c.json({ success: true, data: { ...result, id: folder.id } });
});

function folderFromSession(c: Context<SessionEnv, string>) {
  const id = normalizeId(c.req.param("id"));
  if (!id) throw notFound("Folder not found.");
  return getOwnedFolder(id, c.get("user").id);
}
