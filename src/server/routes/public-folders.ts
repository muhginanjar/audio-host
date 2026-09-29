import { Hono } from "hono";
import { parseOrThrow } from "../lib/validation";
import { z } from "zod";
import { folderTracksScoped, listFolders } from "../services/folder-service";
import { getSqlite } from "../db";

/**
 * Public folder showcase — no authentication, public homepage-checked folders only.
 * Powers the "/" folder shelf: folders with visibility='public' AND show_on_homepage=1.
 * Owner emails are never exposed here. Folder detail lists public tracks only.
 */
export const publicFolders = new Hono();

const showcaseQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
});

publicFolders.get("/", (c) => {
  const q = parseOrThrow(showcaseQuery, Object.fromEntries(new URL(c.req.url).searchParams));
  const { dtos, meta } = listFolders(null, {
    search: q.search,
    visibility: "public",
    showOnHomepage: true,
    page: q.page,
    perPage: q.per_page,
  });
  // Strip owner email for the public surface.
  const safe = dtos.map((f) => (f.owner ? { ...f, owner: { id: f.owner.id, name: f.owner.name } } : f));
  return c.json({ success: true, data: safe, meta });
});

publicFolders.get("/:id", (c) => {
  const id = (c.req.param("id") ?? "").toUpperCase();
  const folder = getSqlite()
    .prepare(
      "SELECT id, user_id, name, created_at, updated_at FROM folders WHERE id = ? AND visibility = 'public' AND show_on_homepage = 1",
    )
    .get(id) as { id: string; user_id: number; name: string; created_at: string; updated_at: string } | undefined;
  if (!folder) return c.json({ success: false, error: { code: "NOT_FOUND", message: "Folder not found." } }, 404);
  const owner = getSqlite().prepare("SELECT id, name FROM users WHERE id = ?").get(folder.user_id) as
    | { id: number; name: string }
    | undefined;
  const { dtos, meta } = folderTracksScoped({ folderId: folder.id, onlyPublic: true, page: 1, perPage: 100 });
  const safeTracks = dtos.map(({ owner: _o, ...rest }) => rest);
  return c.json({
    success: true,
    data: {
      folder: {
        id: folder.id,
        name: folder.name,
        visibility: "public" as const,
        show_on_homepage: true,
        track_count: meta.total,
        public_track_count: meta.total,
        total_duration: 0,
        total_plays: 0,
        ...(owner ? { owner } : {}),
        created_at: folder.created_at,
        updated_at: folder.updated_at,
      },
      tracks: safeTracks,
      meta,
    },
  });
});
