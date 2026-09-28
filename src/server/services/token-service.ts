import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { ulid } from "ulid";
import { getDb } from "../db";
import { apiTokens, users } from "../db/schema";
import type { ApiTokenRow, UserRow } from "../db/schema";
import { isoNow } from "../lib/dates";
import { generateApiToken, sha256Hex } from "../lib/crypto";
import type { TokenInfo } from "../../shared/types";

export interface IssuedToken {
  raw: string; // shown exactly once, never stored
  row: ApiTokenRow;
}

export interface TokenPrincipal {
  token: ApiTokenRow;
  user: UserRow;
}

/** Issues a new token, revoking any previous active one (single active per user). */
export function issueToken(userId: number, createdBy: number | null): IssuedToken {
  const db = getDb();
  const raw = generateApiToken();
  const row = db.transaction((tx) => {
    tx.update(apiTokens)
      .set({ revokedAt: isoNow() })
      .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
      .run();
    return tx
      .insert(apiTokens)
      .values({
        id: ulid(),
        userId,
        tokenHash: sha256Hex(raw),
        tokenPrefix: raw.slice(0, 12), // "aud_" + 8 hex
        tokenSuffix: raw.slice(-4),
        createdBy,
        createdAt: isoNow(),
      })
      .returning()
      .get();
  });
  return { raw, row };
}

export function revokeToken(userId: number): boolean {
  const res = getDb()
    .update(apiTokens)
    .set({ revokedAt: isoNow() })
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt)))
    .run();
  return res.changes > 0;
}

export function resolveToken(raw: string): TokenPrincipal | null {
  const row = getDb()
    .select({ token: apiTokens, user: users })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(
      and(
        eq(apiTokens.tokenHash, sha256Hex(raw)),
        isNull(apiTokens.revokedAt),
        or(isNull(apiTokens.expiresAt), sql`${apiTokens.expiresAt} > ${isoNow()}`),
      ),
    )
    .get();
  if (!row || row.user.status !== "active") return null;
  return row;
}

export function touchToken(tokenId: string) {
  const db = getDb();
  // Throttle the write to ~1/min per token; last_used_at is informational.
  db.update(apiTokens)
    .set({ lastUsedAt: isoNow() })
    .where(and(eq(apiTokens.id, tokenId), sql`(${apiTokens.lastUsedAt} IS NULL OR ${apiTokens.lastUsedAt} < ${oneMinuteAgo()})`))
    .run();
}

function oneMinuteAgo(): string {
  return new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function tokenInfoFor(userId: number): TokenInfo {
  const row = getDb()
    .select()
    .from(apiTokens)
    .where(eq(apiTokens.userId, userId))
    .orderBy(desc(apiTokens.createdAt))
    .limit(1)
    .get();
  if (!row) {
    return { has_token: false, prefix: null, suffix: null, masked: null, created_at: null, last_used_at: null, revoked_at: null };
  }
  return {
    has_token: row.revokedAt === null,
    prefix: row.tokenPrefix,
    suffix: row.tokenSuffix,
    masked: `${row.tokenPrefix}••••••••••••${row.tokenSuffix}`,
    created_at: row.createdAt,
    last_used_at: row.lastUsedAt,
    revoked_at: row.revokedAt,
  };
}
