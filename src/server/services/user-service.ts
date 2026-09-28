import { eq, sql } from "drizzle-orm";
import { getDb, getSqlite } from "../db";
import { audioFiles, users } from "../db/schema";
import type { UserRow } from "../db/schema";
import { isoNow } from "../lib/dates";
import { hashPassword } from "../lib/crypto";
import { AppError, badRequest, notFound } from "../lib/errors";
import { getStorage } from "../storage";
import { destroySessionsForUser } from "./auth-service";
import { tokenInfoFor, issueToken } from "./token-service";
import { getSettings } from "./settings-service";
import type { StorageUsage, TokenInfo, UserAdminDTO, UserRole, UserStatus } from "../../shared/types";

const MB = 1024 * 1024;

export interface UserWithStats extends UserRow {
  audio_count: number;
  storage_used_bytes: number;
  last_api_request_at: string | null;
}

export function getUserById(id: number): UserRow | null {
  return getDb().select().from(users).where(eq(users.id, id)).get() ?? null;
}

export function getUserOrThrow(id: number): UserRow {
  const user = getUserById(id);
  if (!user) throw notFound("User not found.");
  return user;
}

export function emailTaken(email: string, exceptUserId?: number): boolean {
  const rows = getDb().select({ id: users.id }).from(users).where(sql`lower(email) = lower(${email})`).all();
  return rows.some((r) => r.id !== exceptUserId);
}

export function storageUsedBytes(userId: number): number {
  const row = getDb()
    .select({ used: sql<number>`COALESCE(SUM(${audioFiles.size}), 0)` })
    .from(audioFiles)
    .where(eq(audioFiles.userId, userId))
    .get();
  return row?.used ?? 0;
}

export function effectiveLimitBytes(user: UserRow): number {
  return user.storageLimitBytes ?? getSettings().default_user_storage_limit_mb * MB;
}

export function storageUsage(user: UserRow): StorageUsage {
  const limit = effectiveLimitBytes(user);
  const used = storageUsedBytes(user.id);
  return {
    limit_bytes: limit,
    used_bytes: used,
    remaining_bytes: Math.max(0, limit - used),
    percent_used: limit > 0 ? Math.min(100, Math.round((used / limit) * 1000) / 10) : 0,
  };
}

export interface UserListResult {
  rows: UserWithStats[];
  total: number;
}

const USER_STATS_SQL = `
SELECT u.id, u.name, u.email, u.password_hash, u.role, u.status, u.storage_limit_bytes,
       u.last_login_at, u.created_at, u.updated_at,
       (SELECT COUNT(*) FROM audio_files WHERE user_id = u.id) AS audio_count,
       (SELECT COALESCE(SUM(size),0) FROM audio_files WHERE user_id = u.id) AS storage_used,
       (SELECT MAX(created_at) FROM api_logs WHERE user_id = u.id) AS last_api_request
FROM users u`;

interface RawUserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  role: "admin" | "user";
  status: "active" | "disabled";
  storage_limit_bytes: number | null;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  audio_count: number;
  storage_used: number;
  last_api_request: string | null;
}

function mapUserRow(r: RawUserRow): UserWithStats {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    passwordHash: r.password_hash,
    role: r.role,
    status: r.status,
    storageLimitBytes: r.storage_limit_bytes,
    lastLoginAt: r.last_login_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    audio_count: r.audio_count,
    storage_used_bytes: r.storage_used,
    last_api_request_at: r.last_api_request,
  };
}

export function listUsers(opts: { search?: string; page: number; perPage: number }): UserListResult {
  const client = getSqlite();
  const filter = opts.search ? " WHERE u.name LIKE ? OR lower(u.email) LIKE ?" : "";
  const params = opts.search ? [`%${opts.search}%`, `%${opts.search.toLowerCase()}%`] : [];
  const rows = client
    .prepare(`${USER_STATS_SQL}${filter} ORDER BY u.id LIMIT ? OFFSET ?`)
    .all(...params, opts.perPage, (opts.page - 1) * opts.perPage) as RawUserRow[];
  const total = (
    client
      .prepare(`SELECT COUNT(*) AS n FROM users u${filter}`)
      .get(...params) as { n: number }
  ).n;
  return { rows: rows.map(mapUserRow), total };
}

export function toUserAdminDTO(user: UserWithStats | UserRow, token: TokenInfo): UserAdminDTO {
  const stats = user as Partial<UserWithStats>;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    storage_limit_bytes: user.storageLimitBytes,
    storage_used_bytes: stats.storage_used_bytes ?? storageUsedBytes(user.id),
    audio_count: stats.audio_count ?? 0,
    last_login_at: user.lastLoginAt,
    last_api_request_at: stats.last_api_request_at ?? null,
    token,
    created_at: user.createdAt,
    updated_at: user.updatedAt,
  };
}

export function getUserAdminDTO(id: number): UserAdminDTO {
  const row = getSqlite().prepare(`${USER_STATS_SQL} WHERE u.id = ?`).get(id) as RawUserRow | undefined;
  if (!row) throw notFound("User not found.");
  return toUserAdminDTO(mapUserRow(row), tokenInfoFor(id));
}

export interface NewUserInput {
  name: string;
  email: string;
  password: string;
  storageLimitBytes?: number | null;
  status?: UserStatus;
  createdBy: number | null;
}

/** Creates a user AND its API token (brief §18). Raw token returned once. */
export async function createUser(input: NewUserInput): Promise<{ user: UserRow; rawToken: string }> {
  const db = getDb();
  const email = input.email.toLowerCase();
  if (emailTaken(email)) throw new AppError("VALIDATION_ERROR", "That email address is already in use.");
  const now = isoNow();
  const user = db
    .insert(users)
    .values({
      name: input.name,
      email,
      passwordHash: await hashPassword(input.password),
      role: "user",
      status: input.status ?? "active",
      storageLimitBytes: input.storageLimitBytes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  const { raw } = issueToken(user.id, input.createdBy);
  return { user, rawToken: raw };
}

export interface UserPatch {
  name?: string;
  email?: string;
  status?: UserStatus;
  storageLimitBytes?: number | null;
}

export function updateUser(id: number, patch: UserPatch): UserRow {
  const db = getDb();
  const target = getUserOrThrow(id);
  const set: Partial<UserRow> = { updatedAt: isoNow() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.status !== undefined) set.status = patch.status;
  if (patch.storageLimitBytes !== undefined) set.storageLimitBytes = patch.storageLimitBytes;
  if (patch.email !== undefined && patch.email.toLowerCase() !== target.email.toLowerCase()) {
    const email = patch.email.toLowerCase();
    if (emailTaken(email, id)) throw new AppError("VALIDATION_ERROR", "That email address is already in use.");
    set.email = email;
  }
  const row = db.update(users).set(set).where(eq(users.id, id)).returning().get();
  if ((patch.status && patch.status !== target.status) || patch.email) destroySessionsForUser(id);
  return row;
}

export async function resetPassword(id: number, password: string): Promise<void> {
  getUserOrThrow(id);
  await getDb()
    .update(users)
    .set({ passwordHash: await hashPassword(password), updatedAt: isoNow() })
    .where(eq(users.id, id))
    .run();
  destroySessionsForUser(id);
}

/** Full delete: audio bytes first (storage can't be undone by FK cascade), then row cascade. */
export async function deleteUser(id: number): Promise<void> {
  const db = getDb();
  const target = getUserOrThrow(id);
  if (target.role === "admin") throw badRequest("The administrator account cannot be deleted.");
  const files = db.select({ key: audioFiles.storagePath }).from(audioFiles).where(eq(audioFiles.userId, id)).all();
  const storage = getStorage();
  for (const f of files) await storage.delete(f.key);
  db.delete(users).where(eq(users.id, id)).run();
}

export function userRoleGuard(user: UserRow, required: UserRole): void {
  if (required === "admin" && user.role !== "admin") throw notFound("Resource not found.");
}
