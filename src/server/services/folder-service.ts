import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db";
import { audioFiles, folders, users } from "../db/schema";
import type { FolderRow } from "../db/schema";
import { isoNow } from "../lib/dates";
import { AppError, notFound } from "../lib/errors";
import { toAudioDTO } from "./audio-service";
import type { FolderDTO, Visibility } from "../../shared/types";

export interface FolderFilters {
  search?: string;
  visibility?: Visibility;
  showOnHomepage?: boolean;
  page: number;
  perPage: number;
}

export function toFolderDTO(row: FolderRow, counts: { trackCount: number; publicCount: number; duration: number; plays: number }, owner?: { id: number; name: string }): FolderDTO {
  return {
    id: row.id,
    name: row.name,
    visibility: row.visibility as Visibility,
    show_on_homepage: row.showOnHomepage === 1,
    track_count: counts.trackCount,
    public_track_count: counts.publicCount,
    total_duration: counts.duration,
    total_plays: counts.plays,
    ...(owner ? { owner } : {}),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export function getOwnedFolder(id: string, userId: number): FolderRow {
  const row = getDb()
    .select()
    .from(folders)
    .where(and(eq(folders.id, id.toUpperCase()), eq(folders.userId, userId)))
    .get();
  if (!row) throw notFound(`Folder "${id}" was not found in this account.`);
  return row;
}

export function folderCounts(folderId: string): { trackCount: number; publicCount: number; duration: number; plays: number } {
  const row = getDb()
    .select({
      trackCount: sql<number>`COUNT(*)`,
      publicCount: sql<number>`SUM(CASE WHEN visibility = 'public' THEN 1 ELSE 0 END)`,
      duration: sql<number>`COALESCE(SUM(duration), 0)`,
      plays: sql<number>`COALESCE(SUM(play_count), 0)`,
    })
    .from(audioFiles)
    .where(eq(audioFiles.folderId, folderId))
    .get();
  return {
    trackCount: row?.trackCount ?? 0,
    publicCount: row?.publicCount ?? 0,
    duration: row?.duration ?? 0,
    plays: row?.plays ?? 0,
  };
}

export interface FolderTracksScoped {
  folderId: string;
  userId?: number;
  onlyPublic: boolean;
  page: number;
  perPage: number;
}

/**
 * Tracks inside a folder with strict scoping: owner sees everything,
 * public visitors see only public tracks (private ones are invisible,
 * including their count).
 */
export function folderTracksScoped(opts: FolderTracksScoped) {
  const db = getDb();
  const conditions = [eq(audioFiles.folderId, opts.folderId)];
  if (opts.userId !== undefined) conditions.push(eq(audioFiles.userId, opts.userId));
  if (opts.onlyPublic) conditions.push(eq(audioFiles.visibility, "public"));
  const where = and(...conditions);
  const folder = db.select({ name: folders.name }).from(folders).where(eq(folders.id, opts.folderId)).get();
  const rows = db
    .select()
    .from(audioFiles)
    .where(where)
    .orderBy(desc(audioFiles.createdAt))
    .limit(opts.perPage)
    .offset((opts.page - 1) * opts.perPage)
    .all();
  const total = db.select({ n: sql<number>`COUNT(*)` }).from(audioFiles).where(where).get()?.n ?? 0;
  return {
    dtos: rows.map((r) => toAudioDTO(r, undefined, folder ? { id: opts.folderId, name: folder.name } : null)),
    meta: { page: opts.page, per_page: opts.perPage, total, total_pages: Math.max(1, Math.ceil(total / opts.perPage)) },
  };
}

export interface FolderListResult {
  dtos: FolderDTO[];
  meta: { page: number; per_page: number; total: number; total_pages: number };
}

export function listFolders(userId: number | null, filters: FolderFilters): FolderListResult {
  const db = getDb();
  const conditions = [];
  if (userId !== null) conditions.push(eq(folders.userId, userId));
  if (filters.visibility) conditions.push(eq(folders.visibility, filters.visibility));
  if (filters.showOnHomepage !== undefined) conditions.push(eq(folders.showOnHomepage, filters.showOnHomepage ? 1 : 0));
  if (filters.search) conditions.push(like(folders.name, `%${filters.search}%`));
  const where = conditions.length ? and(...conditions) : undefined;

  const withOwner = userId === null;
  const rows = db
    .select(
      withOwner
        ? { row: folders, ownerId: users.id, ownerName: users.name }
        : { row: folders, ownerId: sql<number | null>`NULL`, ownerName: sql<string | null>`NULL` },
    )
    .from(folders)
    .leftJoin(users, eq(folders.userId, users.id))
    .where(where)
    .orderBy(asc(folders.name))
    .limit(filters.perPage)
    .offset((filters.page - 1) * filters.perPage)
    .all();

  const total = db.select({ n: sql<number>`COUNT(*)` }).from(folders).where(where).get()?.n ?? 0;
  return {
    dtos: rows.map((r) =>
      toFolderDTO(
        r.row,
        folderCounts(r.row.id),
        r.ownerId !== null && r.ownerName ? { id: r.ownerId, name: r.ownerName } : undefined,
      ),
    ),
    meta: { page: filters.page, per_page: filters.perPage, total, total_pages: Math.max(1, Math.ceil(total / filters.perPage)) },
  };
}

export function createFolder(userId: number, input: { name: string; visibility?: Visibility; showOnHomepage?: boolean }): FolderRow {
  const db = getDb();
  const name = input.name.trim();
  if (name.length === 0) throw new AppError("VALIDATION_ERROR", "Folder name cannot be blank.");
  if (name.length > 120) throw new AppError("VALIDATION_ERROR", "Folder name is too long (max 120 characters).");
  const dup = db
    .select({ id: folders.id })
    .from(folders)
    .where(and(eq(folders.userId, userId), sql`lower(${folders.name}) = lower(${name})`))
    .get();
  if (dup) throw new AppError("VALIDATION_ERROR", `A folder named "${name}" already exists.`);
  const now = isoNow();
  return db
    .insert(folders)
    .values({
      id: ulid(),
      userId,
      name,
      visibility: input.visibility ?? "private",
      showOnHomepage: input.showOnHomepage ? 1 : 0,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
}

export interface FolderPatch {
  name?: string;
  visibility?: Visibility;
  showOnHomepage?: boolean;
}

export function updateFolder(id: string, userId: number, patch: FolderPatch): FolderRow {
  const db = getDb();
  const target = getOwnedFolder(id, userId);
  const set: Partial<FolderRow> = { updatedAt: isoNow() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name.length === 0) throw new AppError("VALIDATION_ERROR", "Folder name cannot be blank.");
    if (name.length > 120) throw new AppError("VALIDATION_ERROR", "Folder name is too long (max 120 characters).");
    if (name.toLowerCase() !== target.name.toLowerCase()) {
      const dup = db
        .select({ id: folders.id })
        .from(folders)
        .where(and(eq(folders.userId, userId), sql`lower(${folders.name}) = lower(${name})`))
        .get();
      if (dup) throw new AppError("VALIDATION_ERROR", `A folder named "${name}" already exists.`);
    }
    set.name = name;
  }
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  if (patch.showOnHomepage !== undefined) set.showOnHomepage = patch.showOnHomepage ? 1 : 0;
  return db.update(folders).set(set).where(eq(folders.id, target.id)).returning().get();
}

export function deleteFolder(id: string, userId: number, deleteContents: boolean): { deleted: boolean; tracksDeleted: number } {
  const db = getDb();
  const target = getOwnedFolder(id, userId);
  let tracksDeleted = 0;
  if (deleteContents) {
    const rows = db.select({ id: audioFiles.id }).from(audioFiles).where(eq(audioFiles.folderId, target.id)).all();
    tracksDeleted = rows.length;
  } else {
    db.update(audioFiles).set({ folderId: null }).where(eq(audioFiles.folderId, target.id)).run();
  }
  db.delete(folders).where(eq(folders.id, target.id)).run();
  return { deleted: true, tracksDeleted };
}

/** Owner check shared by upload/PATCH: foreign ids behave like missing ones. */
export function resolveFolderForUser(folderId: string | null | undefined, userId: number): string | null {
  if (!folderId) return null;
  return getOwnedFolder(folderId, userId).id;
}

