import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { systemSettings } from "../db/schema";
import { env } from "../env";
import { isoNow } from "../lib/dates";
import type { AppSettings } from "../../shared/types";

type NumericKey = "api_rate_limit_per_minute" | "upload_rate_limit_per_minute" | "max_upload_size_mb" | "default_user_storage_limit_mb";

const DEFAULTS: Record<string, string | number> = {
  api_rate_limit_per_minute: env.apiRateLimit,
  upload_rate_limit_per_minute: env.uploadRateLimit,
  max_upload_size_mb: env.maxUploadSizeMb,
  default_user_storage_limit_mb: env.defaultUserStorageLimitMb,
  cors_allowed_origins: env.corsAllowedOrigins,
};

let cache: Map<string, string> | null = null;

function settingsMap(): Map<string, string> {
  if (!cache) {
    cache = new Map(
      getDb()
        .select()
        .from(systemSettings)
        .all()
        .map((row) => [row.key, row.value]),
    );
  }
  return cache;
}

function raw(key: string): string {
  return settingsMap().get(key) ?? String(DEFAULTS[key] ?? "");
}

function numeric(key: NumericKey): number {
  const n = Number(raw(key));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : Number(DEFAULTS[key]);
}

export function getSettings(): AppSettings {
  return {
    api_rate_limit_per_minute: numeric("api_rate_limit_per_minute"),
    upload_rate_limit_per_minute: numeric("upload_rate_limit_per_minute"),
    max_upload_size_mb: numeric("max_upload_size_mb"),
    default_user_storage_limit_mb: numeric("default_user_storage_limit_mb"),
    cors_allowed_origins: raw("cors_allowed_origins"),
    app_url: env.appUrl,
  };
}

export function setSettings(updates: Record<string, string>): AppSettings {
  const db = getDb();
  const now = isoNow();
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(updates)) {
      if (!(key in DEFAULTS)) continue; // only known keys are persisted
      tx.insert(systemSettings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({ target: systemSettings.key, set: { value, updatedAt: now } })
        .run();
    }
  });
  cache = null;
  return getSettings();
}

/** Validate + coerce a partial admin settings payload. */
export function applySettingsPatch(patch: Record<string, unknown>): AppSettings {
  const updates: Record<string, string> = {};
  for (const key of ["api_rate_limit_per_minute", "upload_rate_limit_per_minute", "max_upload_size_mb", "default_user_storage_limit_mb", "cors_allowed_origins"] as const) {
    if (patch[key] !== undefined) updates[key] = String(patch[key]).trim();
  }
  for (const numKey of ["api_rate_limit_per_minute", "upload_rate_limit_per_minute", "max_upload_size_mb", "default_user_storage_limit_mb"]) {
    if (numKey in updates && !(Number(updates[numKey]) > 0)) {
      throw new Error(`${numKey} must be a positive number`);
    }
  }
  return setSettings(updates);
}

export function listCorsOrigins(): string[] {
  return getSettings()
    .cors_allowed_origins.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
