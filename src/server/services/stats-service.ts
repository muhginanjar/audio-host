import { desc, eq } from "drizzle-orm";
import { getDb, getSqlite } from "../db";
import { audioAccessLogs, audioFiles, users } from "../db/schema";
import { utcDayBounds, utcToday } from "../lib/dates";
import { storageUsage } from "./user-service";
import { listAudios, toAudioDTO } from "./audio-service";
import type { AdminOverview, ActivityItem, DashboardStats } from "../../shared/types";

interface ScalarCounts {
  [key: string]: number;
}

function scalarCounts(sqlText: string, params: (string | number)[] = []): ScalarCounts {
  const row = getSqlite().prepare(sqlText).get(...params) as ScalarCounts | undefined;
  return row ?? {};
}

export function userDashboard(userId: number): DashboardStats {
  const db = getDb();
  const day = utcDayBounds(utcToday());
  const user = db.select().from(users).where(eq(users.id, userId)).get();

  const counts = scalarCounts(
    `SELECT
       (SELECT COUNT(*) FROM audio_files WHERE user_id = ? AND created_at BETWEEN ? AND ?) AS uploads_today,
       (SELECT COUNT(*) FROM audio_access_logs al
          INNER JOIN audio_files af ON af.id = al.audio_id
         WHERE af.user_id = ? AND al.created_at BETWEEN ? AND ?) AS plays_today,
       (SELECT COUNT(*) FROM api_logs WHERE user_id = ? AND created_at BETWEEN ? AND ?) AS api_today`,
    [userId, day.start, day.end, userId, day.start, day.end, userId, day.start, day.end],
  );

  const mine = listAudios(userId, { page: 1, perPage: 6, sort: "created_at", order: "desc" });
  const recent = listAudios(null, { page: 1, perPage: 6, sort: "created_at", order: "desc" });

  const activity: ActivityItem[] = [];
  for (const a of mine.dtos.slice(0, 5)) {
    activity.push({ kind: "upload", label: `Uploaded “${a.title}”`, detail: `${(a.size / 1048576).toFixed(1)} MB`, at: a.created_at });
  }
  const plays = db
    .select({ title: audioFiles.title, createdAt: audioAccessLogs.createdAt, ip: audioAccessLogs.ipAddress })
    .from(audioAccessLogs)
    .innerJoin(audioFiles, eq(audioFiles.id, audioAccessLogs.audioId))
    .where(eq(audioFiles.userId, userId))
    .orderBy(desc(audioAccessLogs.id))
    .limit(5)
    .all();
  for (const p of plays) {
    activity.push({ kind: "play", label: `Played “${p.title}”`, detail: p.ip, at: p.createdAt });
  }
  const apiRecent = getSqlite()
    .prepare("SELECT method, path, status_code, created_at FROM api_logs WHERE user_id = ? ORDER BY id DESC LIMIT 5")
    .all(userId) as { method: string; path: string; status_code: number; created_at: string }[];
  for (const l of apiRecent) {
    activity.push({ kind: "api", label: `${l.method} ${l.path}`, detail: `→ ${l.status_code}`, at: l.created_at });
  }
  activity.sort((a, b) => (a.at < b.at ? 1 : -1));

  return {
    audio_count: mine.meta.total,
    storage_used_bytes: user ? storageUsage(user).used_bytes : 0,
    storage: user ? storageUsage(user) : { limit_bytes: 0, used_bytes: 0, remaining_bytes: 0, percent_used: 0 },
    uploads_today: counts.uploads_today ?? 0,
    plays_today: counts.plays_today ?? 0,
    api_requests_today: counts.api_today ?? 0,
    recent_audio: recent.dtos,
    my_recent_audio: mine.dtos,
    recent_activity: activity.slice(0, 10),
  };
}

export interface PublicFeedStats {
  total_tracks: number;
  total_plays: number;
  total_size_bytes: number;
  contributors: number;
  tracks_today: number;
}

/** Header numbers for the "/" playlist homepage (public files only). */
export function publicFeedStats(): PublicFeedStats {
  const day = utcDayBounds(utcToday());
  const counts = scalarCounts(
    `SELECT
       (SELECT COUNT(*) FROM audio_files WHERE visibility = 'public') AS total_tracks,
       (SELECT COALESCE(SUM(play_count),0) FROM audio_files WHERE visibility = 'public') AS total_plays,
       (SELECT COALESCE(SUM(size),0) FROM audio_files WHERE visibility = 'public') AS total_size_bytes,
       (SELECT COUNT(DISTINCT user_id) FROM audio_files WHERE visibility = 'public') AS contributors,
       (SELECT COUNT(*) FROM audio_files WHERE visibility = 'public' AND created_at BETWEEN ? AND ?) AS tracks_today`,
    [day.start, day.end],
  );
  return {
    total_tracks: counts.total_tracks ?? 0,
    total_plays: counts.total_plays ?? 0,
    total_size_bytes: counts.total_size_bytes ?? 0,
    contributors: counts.contributors ?? 0,
    tracks_today: counts.tracks_today ?? 0,
  };
}

export function adminOverview(): AdminOverview {
  const day = utcDayBounds(utcToday());
  const totals = scalarCounts(
    `SELECT
       (SELECT COUNT(*) FROM users WHERE role = 'user') AS total_users,
       (SELECT COUNT(*) FROM users WHERE role = 'user' AND status = 'active') AS total_active_users,
       (SELECT COUNT(*) FROM audio_files) AS total_audio,
       (SELECT COALESCE(SUM(size),0) FROM audio_files) AS total_storage,
       (SELECT COUNT(*) FROM audio_files WHERE created_at BETWEEN ? AND ?) AS uploads_today,
       (SELECT COUNT(*) FROM api_logs WHERE created_at BETWEEN ? AND ?) AS api_today,
       (SELECT COUNT(*) FROM api_logs WHERE status_code >= 400 AND created_at BETWEEN ? AND ?) AS api_errors_today`,
    [day.start, day.end, day.start, day.end, day.start, day.end],
  );

  const top = getSqlite()
    .prepare(
      `SELECT u.id, u.name, u.email,
              (SELECT COUNT(*) FROM audio_files WHERE user_id = u.id) AS audio_count,
              (SELECT COALESCE(SUM(size),0) FROM audio_files WHERE user_id = u.id) AS storage_used
       FROM users u WHERE u.role = 'user'
       ORDER BY storage_used DESC LIMIT 5`,
    )
    .all() as { id: number; name: string; email: string; audio_count: number; storage_used: number }[];

  return {
    total_users: totals.total_users ?? 0,
    total_active_users: totals.total_active_users ?? 0,
    total_audio: totals.total_audio ?? 0,
    total_storage_bytes: totals.total_storage ?? 0,
    uploads_today: totals.uploads_today ?? 0,
    api_requests_today: totals.api_today ?? 0,
    api_errors_today: totals.api_errors_today ?? 0,
    top_users_by_storage: top.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      audio_count: r.audio_count,
      storage_used_bytes: r.storage_used,
    })),
  };
}

/** Global recent audio across tenants (admin dashboard "latest uploads"). */
export function recentAudioGlobal(limit: number) {
  const db = getDb();
  const rows = db
    .select({ row: audioFiles, ownerId: users.id, ownerName: users.name, ownerEmail: users.email })
    .from(audioFiles)
    .innerJoin(users, eq(audioFiles.userId, users.id))
    .orderBy(desc(audioFiles.createdAt))
    .limit(limit)
    .all();
  return rows.map((r) => toAudioDTO(r.row, { id: r.ownerId, name: r.ownerName, email: r.ownerEmail }));
}
