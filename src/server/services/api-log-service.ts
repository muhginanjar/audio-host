import { and, desc, eq, gte, like, lte, sql, type SQL } from "drizzle-orm";
import { getDb } from "../db";
import { apiLogs, users } from "../db/schema";
import { isoNow, utcDayBounds } from "../lib/dates";
import type { z } from "zod";
import type { apiLogQuerySchema } from "../lib/validation";
import type { ApiLogDTO, PaginationMeta } from "../../shared/types";

export interface ApiLogEntry {
  userId: number | null;
  apiTokenId: string | null;
  method: string;
  path: string;
  statusCode: number;
  ip: string | null;
  userAgent: string | null;
  responseTimeMs: number;
}

export function logApiRequest(entry: ApiLogEntry) {
  getDb()
    .insert(apiLogs)
    .values({
      userId: entry.userId,
      apiTokenId: entry.apiTokenId,
      method: entry.method,
      path: entry.path.slice(0, 500),
      statusCode: entry.statusCode,
      ipAddress: entry.ip,
      userAgent: entry.userAgent?.slice(0, 400) ?? null,
      responseTimeMs: entry.responseTimeMs,
      createdAt: isoNow(),
    })
    .run();
}

export type ApiLogFilters = Omit<z.infer<typeof apiLogQuerySchema>, "page" | "per_page">;

export function queryApiLogs(
  filters: ApiLogFilters & { page: number; perPage: number },
): { rows: ApiLogDTO[]; meta: PaginationMeta } {
  const db = getDb();
  const conditions: SQL[] = [];
  if (filters.user_id !== undefined) conditions.push(eq(apiLogs.userId, filters.user_id));
  if (filters.status !== undefined) conditions.push(eq(apiLogs.statusCode, filters.status));
  if (filters.search) conditions.push(like(apiLogs.path, `%${filters.search}%`));
  if (filters.date_from) conditions.push(gte(apiLogs.createdAt, utcDayBounds(filters.date_from).start));
  if (filters.date_to) conditions.push(lte(apiLogs.createdAt, utcDayBounds(filters.date_to).end));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = db
    .select({ log: apiLogs, userName: users.name })
    .from(apiLogs)
    .leftJoin(users, eq(apiLogs.userId, users.id))
    .where(where)
    .orderBy(desc(apiLogs.id))
    .limit(filters.perPage)
    .offset((filters.page - 1) * filters.perPage)
    .all();

  const total = db.select({ n: sql<number>`COUNT(*)` }).from(apiLogs).where(where).get()?.n ?? 0;
  return {
    rows: rows.map((r) => ({
      id: r.log.id,
      user_id: r.log.userId,
      user_name: r.userName,
      api_token_id: r.log.apiTokenId,
      method: r.log.method,
      path: r.log.path,
      status_code: r.log.statusCode,
      ip_address: r.log.ipAddress ?? "",
      user_agent: r.log.userAgent ?? "",
      response_time_ms: r.log.responseTimeMs,
      created_at: r.log.createdAt,
    })),
    meta: { page: filters.page, per_page: filters.perPage, total, total_pages: Math.max(1, Math.ceil(total / filters.perPage)) },
  };
}

export interface DayCounts {
  requests: number;
  errors: number;
}

export function countApiDay(day: string): DayCounts {
  const { start, end } = utcDayBounds(day);
  const row = getDb()
    .select({
      requests: sql<number>`COUNT(*)`,
      errors: sql<number>`SUM(CASE WHEN status_code >= 400 THEN 1 ELSE 0 END)`,
    })
    .from(apiLogs)
    .where(and(gte(apiLogs.createdAt, start), lte(apiLogs.createdAt, end)))
    .get();
  return { requests: row?.requests ?? 0, errors: row?.errors ?? 0 };
}

export function recentApiLogsForUser(userId: number, limit: number) {
  return getDb()
    .select()
    .from(apiLogs)
    .where(eq(apiLogs.userId, userId))
    .orderBy(desc(apiLogs.id))
    .limit(limit)
    .all();
}

/** Ops hygiene: keep only recent logs; documented for cron (README). */
export function pruneApiLogs(olderThanDays: number): number {
  const cutoff = new Date(Date.now() - olderThanDays * 86400_000).toISOString().replace(/\.\d{3}Z$/, "Z");
  return getDb().delete(apiLogs).where(lte(apiLogs.createdAt, cutoff)).run().changes;
}
