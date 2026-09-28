import { and, eq, gt, sql } from "drizzle-orm";
import { getDb } from "../db";
import { sessions, users } from "../db/schema";
import type { UserRow } from "../db/schema";
import { env } from "../env";
import { addDays, isoNow } from "../lib/dates";
import { generateSessionSecret, hashPassword, sha256Hex, verifyPassword } from "../lib/crypto";
import { unauthorized } from "../lib/errors";
import { ulid } from "ulid";

export interface SessionIssue {
  secret: string; // raw cookie value
  sessionId: string;
  expiresAt: string;
}

export interface SessionPrincipal {
  user: UserRow;
  sessionId: string;
}

export async function createUserWithPassword(
  email: string,
  password: string,
  name: string,
  role: "admin" | "user",
): Promise<UserRow> {
  const db = getDb();
  const now = isoNow();
  const row = db
    .insert(users)
    .values({
      email: email.toLowerCase(),
      name,
      passwordHash: await hashPassword(password),
      role,
      status: "active",
      createdAt: now,
      updatedAt: now,
    })
    .returning()
    .get();
  return row;
}

export function findUserByEmail(email: string): UserRow | undefined {
  return getDb()
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .get();
}

/** Validates credentials + status; returns null on any failure (uniform). */
export async function verifyCredentials(email: string, password: string): Promise<UserRow | null> {
  const user = findUserByEmail(email);
  if (!user) {
    await verifyPassword(password, "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA===="); // constant-ish time on unknown email
    return null;
  }
  if (user.status !== "active") return null;
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function createSession(
  userId: number,
  ip: string | null,
  userAgent: string | null,
): Promise<SessionIssue> {
  const db = getDb();
  const secret = generateSessionSecret();
  const issue: SessionIssue = {
    secret,
    sessionId: ulid(),
    expiresAt: addDays(isoNow(), env.sessionTtlDays),
  };
  db.insert(sessions)
    .values({
      id: issue.sessionId,
      userId,
      tokenHash: sha256Hex(secret),
      ip,
      userAgent,
      createdAt: isoNow(),
      lastSeenAt: isoNow(),
      expiresAt: issue.expiresAt,
    })
    .run();
  return issue;
}

export function resolveSession(secret: string): SessionPrincipal | null {
  const db = getDb();
  const row = db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256Hex(secret)), gt(sessions.expiresAt, isoNow())))
    .get();
  if (!row || row.user.status !== "active") return null;
  // Sliding "last seen" touched at most once per minute to avoid write churn.
  const stale = Date.now() - new Date(row.session.lastSeenAt).getTime() > 60_000;
  if (stale) {
    db.update(sessions).set({ lastSeenAt: isoNow() }).where(eq(sessions.id, row.session.id)).run();
  }
  return { user: row.user, sessionId: row.session.id };
}

export function destroySession(secret: string) {
  getDb().delete(sessions).where(eq(sessions.tokenHash, sha256Hex(secret))).run();
}

export function destroySessionsForUser(userId: number) {
  getDb().delete(sessions).where(eq(sessions.userId, userId)).run();
}

export function recordLogin(userId: number) {
  getDb().update(users).set({ lastLoginAt: isoNow() }).where(eq(users.id, userId)).run();
}

export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<true> {
  const db = getDb();
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    throw unauthorized("Current password is incorrect.");
  }
  db.update(users)
    .set({ passwordHash: await hashPassword(newPassword), updatedAt: isoNow() })
    .where(eq(users.id, userId))
    .run();
  destroySessionsForUser(userId); // keep current session? safer: re-login everywhere
  return true;
}

/** Expired sessions sweep (called at boot + hourly). */
export function pruneSessions() {
  getDb().delete(sessions).where(sql`${sessions.expiresAt} <= ${isoNow()}`).run();
}
