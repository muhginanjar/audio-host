import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db";
import { audioAccessLogs, audioFiles, users } from "../db/schema";
import type { AudioFileRow, UserRow } from "../db/schema";
import { env } from "../env";
import { isoNow, utcDayBounds } from "../lib/dates";
import { AppError, notFound, payloadTooLarge, storageLimitExceeded } from "../lib/errors";
import { sniffAudioFile } from "../lib/filesniff";
import { getStorage, storageKeyFor } from "../storage";
import { type z } from "zod";
import { extractMetadata } from "./metadata-service";
import { effectiveLimitBytes, storageUsedBytes } from "./user-service";
import { getSettings } from "./settings-service";
import type { listQuerySchema } from "../lib/validation";
import type { AudioDTO, AudioStatsDTO, PaginationMeta, Visibility } from "../../shared/types";

const MB = 1024 * 1024;

export type ListFilters = Omit<z.infer<typeof listQuerySchema>, "page" | "per_page">;

export interface UploadInput {
  buffer: Buffer;
  originalFilename: string;
  title?: string;
  description?: string;
  visibility?: Visibility;
}

/**
 * Full upload pipeline (shared by REST + GUI, brief §5/§15/§24):
 * size → quota → magic bytes → store → decode metadata → persist record.
 * Stored bytes are removed if any step fails after the write.
 */
export async function uploadAudio(user: UserRow, input: UploadInput): Promise<AudioFileRow> {
  const settings = getSettings();
  const maxBytes = settings.max_upload_size_mb * MB;
  const size = input.buffer.length;

  if (size === 0) {
    throw new AppError("INVALID_FILE", "The uploaded file is empty.");
  }
  if (size > maxBytes) {
    throw payloadTooLarge(`File is ${(size / MB).toFixed(1)} MB; the limit is ${settings.max_upload_size_mb} MB.`);
  }

  const limit = effectiveLimitBytes(user);
  const used = storageUsedBytes(user.id);
  if (used + size > limit) {
    const free = Math.max(0, limit - used);
    throw storageLimitExceeded(
      `Storage limit exceeded: this file needs ${(size / MB).toFixed(1)} MB but only ${(free / MB).toFixed(1)} MB are available.`,
    );
  }

  const sniff = await sniffAudioFile(input.buffer, input.originalFilename);
  if (!sniff.ok) throw new AppError(sniff.code, sniff.message);

  const id = ulid();
  const createdAt = isoNow();
  const key = storageKeyFor(id, sniff.extension, createdAt);
  const storage = getStorage();
  await storage.put(key, input.buffer);

  let meta;
  try {
    meta = await extractMetadata(key);
  } catch (err) {
    await storage.delete(key);
    throw err;
  }

  const baseName = sanitizeOriginalFilename(input.originalFilename);
  const row = getDb()
    .insert(audioFiles)
    .values({
      id,
      userId: user.id,
      originalFilename: baseName,
      storedFilename: `${id}.${sniff.extension}`,
      title: (input.title?.trim() || meta.titleTag || baseName).slice(0, 300),
      description: input.description?.trim().slice(0, 5000) ?? "",
      mimeType: sniff.mimeType,
      extension: sniff.extension,
      size,
      duration: meta.duration,
      bitrate: meta.bitrate,
      sampleRate: meta.sampleRate,
      channels: meta.channels,
      format: meta.format,
      codec: meta.codec,
      artist: meta.artist,
      album: meta.album,
      visibility: input.visibility ?? "public",
      status: "ready",
      storageDisk: storage.disk,
      storagePath: key,
      publicUrl: audioPublicUrl(id),
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
    .get();

  return row;
}

export function audioPublicUrl(id: string): string {
  return `${env.appUrl}/a/${id}`;
}

/** Never let a user-supplied name reach logs/UI with control chars or paths. */
export function sanitizeOriginalFilename(name: string): string {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? "audio";
  // eslint-disable-next-line no-control-regex
  const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, "_").trim();
  return (clean || "audio").slice(0, 255);
}

export function getAudioById(id: string): AudioFileRow | null {
  return getDb().select().from(audioFiles).where(eq(audioFiles.id, id)).get() ?? null;
}

/** Owner-scoped fetch: cross-tenant ids look identical to missing ones (404). */
export function getOwnedAudio(id: string, userId: number): AudioFileRow {
  const row = getDb()
    .select()
    .from(audioFiles)
    .where(and(eq(audioFiles.id, id), eq(audioFiles.userId, userId)))
    .get();
  if (!row) throw notFound(`Audio "${id}" was not found in this account.`);
  return row;
}

export interface AudioListResult {
  dtos: AudioDTO[];
  meta: PaginationMeta;
}

/**
 * Listing for user scope (userId set) or admin scope (userId null, owners joined).
 * Filters: search/format/visibility/date/size/duration + whitelisted sort.
 */
export function listAudios(
  scope: number | "all" | null,
  filters: ListFilters & { page: number; perPage: number },
): AudioListResult {
  const db = getDb();
  const conditions = [];
  if (scope === "all") {
    // Admin sees everything across tenants.
  } else if (scope === null) {
    // Public homepage/discovery feed: only public files from any account.
    conditions.push(eq(audioFiles.visibility, "public"));
  } else {
    conditions.push(eq(audioFiles.userId, scope));
  }
  if (filters.visibility) conditions.push(eq(audioFiles.visibility, filters.visibility));
  if (filters.search) {
    const q = `%${filters.search}%`;
    conditions.push(or(like(audioFiles.title, q), like(audioFiles.description, q), like(audioFiles.originalFilename, q)));
  }
  if (filters.date_from) conditions.push(gte(audioFiles.createdAt, utcDayBounds(filters.date_from).start));
  if (filters.date_to) conditions.push(lte(audioFiles.createdAt, utcDayBounds(filters.date_to).end));
  if (filters.min_size !== undefined) conditions.push(gte(audioFiles.size, filters.min_size));
  if (filters.max_size !== undefined) conditions.push(lte(audioFiles.size, filters.max_size));
  if (filters.min_duration !== undefined) conditions.push(gte(audioFiles.duration, filters.min_duration));
  if (filters.max_duration !== undefined) conditions.push(lte(audioFiles.duration, filters.max_duration));

  const where = conditions.length ? and(...conditions) : undefined;
  const sortCol = {
    created_at: audioFiles.createdAt,
    updated_at: audioFiles.updatedAt,
    title: audioFiles.title,
    size: audioFiles.size,
    duration: audioFiles.duration,
    play_count: audioFiles.playCount,
  }[filters.sort];
  const dir = filters.order === "asc" ? asc : desc;

  const selectShape =
    typeof scope === "number"
      ? { row: audioFiles, ownerId: sql<number | null>`NULL`, ownerName: sql<string | null>`NULL`, ownerEmail: sql<string | null>`NULL` }
      : {
          row: audioFiles,
          ownerId: users.id,
          ownerName: users.name,
          ownerEmail: users.email,
        };

  const rows = db
    .select(selectShape)
    .from(audioFiles)
    .leftJoin(users, eq(audioFiles.userId, users.id))
    .where(where)
    .orderBy(dir(sortCol), dir(audioFiles.id))
    .limit(filters.perPage)
    .offset((filters.page - 1) * filters.perPage)
    .all();

  const total = db.select({ n: sql<number>`COUNT(*)` }).from(audioFiles).where(where).get()?.n ?? 0;

  return {
    dtos: rows.map((r) =>
      toAudioDTO(
        r.row,
        r.ownerId !== null && r.ownerName
          ? { id: r.ownerId, name: r.ownerName, email: r.ownerEmail! }
          : undefined,
      ),
    ),
    meta: {
      page: filters.page,
      per_page: filters.perPage,
      total,
      total_pages: Math.max(1, Math.ceil(total / filters.perPage)),
    },
  };
}

export function toAudioDTO(row: AudioFileRow, owner?: { id: number; name: string; email: string }): AudioDTO {
  return {
    id: row.id,
    filename: row.originalFilename,
    title: row.title,
    description: row.description,
    mime_type: row.mimeType,
    extension: row.extension,
    size: row.size,
    duration: row.duration,
    bitrate: row.bitrate,
    sample_rate: row.sampleRate,
    channels: row.channels,
    format: row.format,
    codec: row.codec,
    artist: row.artist,
    album: row.album,
    visibility: row.visibility as Visibility,
    status: row.status,
    url: row.publicUrl,
    embed_url: `${env.appUrl}/embed/${row.id}`,
    download_url: `${row.publicUrl}?dl=1`,
    play_count: row.playCount,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    ...(owner ? { owner } : {}),
  };
}

export interface AudioPatch {
  title?: string;
  description?: string;
  visibility?: Visibility;
}

export function updateAudio(id: string, userId: number, patch: AudioPatch): AudioFileRow {
  getOwnedAudio(id, userId);
  const set: Partial<AudioFileRow> = { updatedAt: isoNow() };
  if (patch.title !== undefined) set.title = patch.title.slice(0, 300);
  if (patch.description !== undefined) set.description = patch.description.slice(0, 5000);
  if (patch.visibility !== undefined) set.visibility = patch.visibility;
  return getDb().update(audioFiles).set(set).where(eq(audioFiles.id, id)).returning().get();
}

/** Removes bytes + row (+ cascaded access logs). Returns the deleted row (webhook seam). */
export async function deleteAudio(id: string, userId?: number): Promise<AudioFileRow> {
  const row = userId === undefined ? getAudioById(id) : getOwnedAudio(id, userId);
  if (!row) throw notFound(`Audio "${id}" was not found.`);
  await getStorage().delete(row.storagePath);
  getDb().delete(audioFiles).where(eq(audioFiles.id, id)).run();
  return row;
}

export interface AccessRecord {
  statusCode: number;
  ip: string | null;
  referer: string | null;
  userAgent: string | null;
  /** Only full (non-Range) deliveries count as a "play". */
  countPlay: boolean;
}

export function recordAccess(audioId: string, rec: AccessRecord) {
  const db = getDb();
  db.insert(audioAccessLogs)
    .values({
      audioId,
      statusCode: rec.statusCode,
      ipAddress: rec.ip,
      referer: rec.referer?.slice(0, 500) ?? null,
      userAgent: rec.userAgent?.slice(0, 400) ?? null,
      createdAt: isoNow(),
    })
    .run();
  if (rec.countPlay) {
    db.update(audioFiles).set({ playCount: sql`${audioFiles.playCount} + 1` }).where(eq(audioFiles.id, audioId)).run();
  }
}

export function getAudioStats(audioId: string): AudioStatsDTO {
  const db = getDb();
  const day = utcDayBounds(new Date().toISOString().slice(0, 10));
  const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  const row = db
    .select({
      playsToday: sql<number>`SUM(CASE WHEN created_at BETWEEN ${day.start} AND ${day.end} THEN 1 ELSE 0 END)`,
      plays7d: sql<number>`SUM(CASE WHEN created_at >= ${weekAgo} THEN 1 ELSE 0 END)`,
      uniqueIps7d: sql<number>`COUNT(DISTINCT CASE WHEN created_at >= ${weekAgo} THEN ip_address END)`,
      lastPlayed: sql<string | null>`MAX(created_at)`,
    })
    .from(audioAccessLogs)
    .where(eq(audioAccessLogs.audioId, audioId))
    .get();
  const audio = getAudioById(audioId);
  return {
    play_count: audio?.playCount ?? 0,
    plays_today: row?.playsToday ?? 0,
    plays_7d: row?.plays7d ?? 0,
    last_played_at: row?.lastPlayed ?? null,
    unique_visitors_7d: row?.uniqueIps7d ?? 0,
  };
}
