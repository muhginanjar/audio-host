import fs from "node:fs";
import path from "node:path";

/** Minimal .env loader — existing process env always wins (pm2/docker friendly). */
function loadDotEnv(file: string) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv(path.resolve(process.cwd(), ".env"));

const num = (v: string | undefined, d: number): number => {
  if (v === undefined || v === "") return d;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`Invalid numeric env value: ${v}`);
  return n;
};

export const env = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  appUrl: (process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, ""),
  port: num(process.env.PORT, 3000),
  host: process.env.HOST ?? "0.0.0.0",

  dbSqlitePath: process.env.DB_SQLITE_PATH ?? "data/audio.sqlite",
  storageDriver: (process.env.STORAGE_DRIVER ?? "local") as "local",
  storageRoot: process.env.STORAGE_ROOT ?? "storage",

  maxUploadSizeMb: num(process.env.MAX_UPLOAD_SIZE_MB, 100),
  apiRateLimit: num(process.env.API_RATE_LIMIT, 100),
  uploadRateLimit: num(process.env.UPLOAD_RATE_LIMIT, 10),
  defaultUserStorageLimitMb: num(process.env.USER_STORAGE_LIMIT_MB, 1024),
  corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS ?? "",
  cookieSecure:
    process.env.COOKIE_SECURE === "1" ||
    (process.env.COOKIE_SECURE === undefined && (process.env.APP_URL ?? "").startsWith("https://")),
  sessionTtlDays: num(process.env.SESSION_TTL_DAYS, 14),
};

export type Env = typeof env;
