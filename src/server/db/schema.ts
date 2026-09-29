import { integer, real, sqliteTable, text, index } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", (t) => ({
  id: t.integer().primaryKey({ autoIncrement: true }),
  name: t.text().notNull(),
  email: t.text().notNull(),
  passwordHash: t.text("password_hash").notNull(),
  role: t.text().$type<"admin" | "user">().notNull().default("user"),
  status: t.text().$type<"active" | "disabled">().notNull().default("active"),
  storageLimitBytes: t.integer("storage_limit_bytes"),
  lastLoginAt: t.text("last_login_at"),
  createdAt: t.text("created_at").notNull(),
  updatedAt: t.text("updated_at").notNull(),
}));

export const sessions = sqliteTable("sessions", (t) => ({
  id: t.text().primaryKey(),
  userId: t.integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: t.text("token_hash").notNull(),
  ip: t.text(),
  userAgent: t.text("user_agent"),
  createdAt: t.text("created_at").notNull(),
  lastSeenAt: t.text("last_seen_at").notNull(),
  expiresAt: t.text("expires_at").notNull(),
}));

export const apiTokens = sqliteTable("api_tokens", (t) => ({
  id: t.text().primaryKey(),
  userId: t.integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: t.text("token_hash").notNull(),
  tokenPrefix: t.text("token_prefix").notNull(),
  tokenSuffix: t.text("token_suffix").notNull(),
  createdBy: t.integer("created_by"),
  lastUsedAt: t.text("last_used_at"),
  expiresAt: t.text("expires_at"),
  revokedAt: t.text("revoked_at"),
  createdAt: t.text("created_at").notNull(),
}));

export const audioFiles = sqliteTable(
  "audio_files",
  (t) => ({
    id: t.text().primaryKey(),
    userId: t.integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    folderId: t.text("folder_id").references(() => folders.id, { onDelete: "set null" }),
    originalFilename: t.text("original_filename").notNull(),
    storedFilename: t.text("stored_filename").notNull(),
    title: t.text().notNull().default(""),
    description: t.text().notNull().default(""),
    mimeType: t.text("mime_type").notNull(),
    extension: t.text().notNull(),
    size: t.integer().notNull(),
    duration: t.real(),
    bitrate: t.integer(),
    sampleRate: t.integer("sample_rate"),
    channels: t.integer(),
    format: t.text(),
    codec: t.text(),
    artist: t.text(),
    album: t.text(),
    visibility: t.text().$type<"public" | "private">().notNull().default("public"),
    status: t.text().$type<"pending" | "ready" | "error">().notNull().default("pending"),
    storageDisk: t.text("storage_disk").notNull().default("local"),
    storagePath: t.text("storage_path").notNull(),
    publicUrl: t.text("public_url").notNull(),
    playCount: t.integer("play_count").notNull().default(0),
    createdAt: t.text("created_at").notNull(),
    updatedAt: t.text("updated_at").notNull(),
  }),
  (t) => [
    index("audio_files_user_created").on(t.userId, t.createdAt),
    index("audio_files_visibility").on(t.visibility),
    index("audio_files_status").on(t.status),
    index("audio_files_folder").on(t.folderId),
  ],
);

export const folders = sqliteTable(
  "folders",
  (t) => ({
    id: t.text().primaryKey(),
    userId: t.integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    name: t.text().notNull(),
    visibility: t.text().$type<"public" | "private">().notNull().default("private"),
    showOnHomepage: t.integer("show_on_homepage").notNull().default(0),
    createdAt: t.text("created_at").notNull(),
    updatedAt: t.text("updated_at").notNull(),
  }),
  (t) => [index("folders_user").on(t.userId)],
);

export const apiLogs = sqliteTable(
  "api_logs",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    userId: t.integer("user_id"), // intentionally no FK: logs outlive user deletion
    apiTokenId: t.text("api_token_id"),
    method: t.text().notNull(),
    path: t.text().notNull(),
    statusCode: t.integer("status_code").notNull(),
    ipAddress: t.text("ip_address"),
    userAgent: t.text("user_agent"),
    responseTimeMs: t.integer("response_time_ms").notNull().default(0),
    createdAt: t.text("created_at").notNull(),
  }),
  (t) => [index("api_logs_created").on(t.createdAt), index("api_logs_user").on(t.userId), index("api_logs_status").on(t.statusCode)],
);

export const audioAccessLogs = sqliteTable(
  "audio_access_logs",
  (t) => ({
    id: t.integer().primaryKey({ autoIncrement: true }),
    audioId: t.text("audio_id").notNull().references(() => audioFiles.id, { onDelete: "cascade" }),
    statusCode: t.integer("status_code").notNull(),
    ipAddress: t.text("ip_address"),
    referer: t.text(),
    userAgent: t.text("user_agent"),
    createdAt: t.text("created_at").notNull(),
  }),
  (t) => [index("audio_access_audio_time").on(t.audioId, t.createdAt)],
);

export const systemSettings = sqliteTable("system_settings", (t) => ({
  key: t.text().primaryKey(),
  value: t.text().notNull(),
  updatedAt: t.text("updated_at").notNull(),
}));

export type UserRow = typeof users.$inferSelect;
export type FolderRow = typeof folders.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type ApiTokenRow = typeof apiTokens.$inferSelect;
export type AudioFileRow = typeof audioFiles.$inferSelect;
export type ApiLogRow = typeof apiLogs.$inferSelect;
export type AudioAccessLogRow = typeof audioAccessLogs.$inferSelect;
