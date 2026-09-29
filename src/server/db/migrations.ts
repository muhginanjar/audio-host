export interface Migration {
  id: string;
  sql: string;
}

/** Source of truth for DDL, kept aligned with schema.ts. Applied in order, tracked in _migrations. */
export const MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    sql: `
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  storage_limit_bytes INTEGER,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX users_email_unique ON users (lower(email));

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE UNIQUE INDEX sessions_token_hash_unique ON sessions (token_hash);
CREATE INDEX sessions_expires ON sessions (expires_at);

CREATE TABLE api_tokens (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  token_prefix TEXT NOT NULL,
  token_suffix TEXT NOT NULL,
  created_by INTEGER,
  last_used_at TEXT,
  expires_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX api_tokens_hash_unique ON api_tokens (token_hash);
CREATE UNIQUE INDEX api_tokens_one_active_per_user ON api_tokens (user_id) WHERE revoked_at IS NULL;

CREATE TABLE audio_files (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_filename TEXT NOT NULL,
  stored_filename TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  mime_type TEXT NOT NULL,
  extension TEXT NOT NULL,
  size INTEGER NOT NULL,
  duration REAL,
  bitrate INTEGER,
  sample_rate INTEGER,
  channels INTEGER,
  format TEXT,
  codec TEXT,
  artist TEXT,
  album TEXT,
  visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','private')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ready','error')),
  storage_disk TEXT NOT NULL DEFAULT 'local',
  storage_path TEXT NOT NULL,
  public_url TEXT NOT NULL,
  play_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX audio_files_user_created ON audio_files (user_id, created_at);
CREATE INDEX audio_files_visibility ON audio_files (visibility);
CREATE INDEX audio_files_status ON audio_files (status);

CREATE TABLE api_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  api_token_id TEXT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  response_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX api_logs_created ON api_logs (created_at);
CREATE INDEX api_logs_user ON api_logs (user_id);
CREATE INDEX api_logs_status ON api_logs (status_code);

CREATE TABLE audio_access_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audio_id TEXT NOT NULL REFERENCES audio_files(id) ON DELETE CASCADE,
  status_code INTEGER NOT NULL,
  ip_address TEXT,
  referer TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX audio_access_audio_time ON audio_access_logs (audio_id, created_at);

CREATE TABLE system_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`,
  },
  {
    id: "0002_folders",
    sql: `
CREATE TABLE folders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('public','private')),
  show_on_homepage INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX folders_user_name_unique ON folders (user_id, lower(name));
CREATE INDEX folders_user ON folders (user_id);
CREATE INDEX folders_public_home ON folders (visibility, show_on_homepage);
ALTER TABLE audio_files ADD COLUMN folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL;
CREATE INDEX audio_files_folder ON audio_files (folder_id);
`,
  },
];
