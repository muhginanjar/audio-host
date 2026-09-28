# Database Schema / ERD

Engine: SQLite (WAL). Timestamps: ISO-8601 UTC strings, set by application code. Primary keys: ULID (26-char, Crockford base32, URL-safe, sortable) for `audio_files`/`api_tokens`/`sessions`; INTEGER autoincrement for users/logs.

## ERD

```mermaid
erDiagram
  users ||--o{ audio_files : owns
  users ||--o{ api_tokens : "has (1 active)"
  users ||--o{ sessions : "has"
  users ||--o{ api_logs : generates
  api_tokens ||--o{ api_logs : authenticates
  audio_files ||--o{ audio_access_logs : "played via"

  users {
    integer id PK
    text name
    text email UK
    text password_hash "scrypt"
    text role "admin|user"
    text status "active|disabled"
    integer storage_limit_bytes "NULL = system default"
    text last_login_at
    text created_at
    text updated_at
  }
  audio_files {
    text id PK "ULID, public URL identifier"
    integer user_id FK
    text original_filename
    text stored_filename "ULID.ext — never original name"
    text title
    text description
    text mime_type
    text extension
    integer size
    real duration "seconds"
    integer bitrate "bps"
    integer sample_rate "Hz"
    integer channels
    text format "container e.g. MPEG-4 Layer 3"
    text codec
    text artist
    text album
    text visibility "public|private (MVP: public)"
    text storage_disk "local|s3"
    text storage_path "audio/2026/09/28/ULID.mp3 (relative to root)"
    text public_url
    text status "processing|ready|error (metadata state, queue-ready)"
    integer play_count
    integer byte_range_count
    text created_at
    text updated_at
  }
  api_tokens {
    text id PK
    integer user_id FK
    text token_hash "SHA-256; raw token never stored"
    text token_prefix "aud_xxxx shown in UI"
    text token_suffix "last 4 shown in UI"
    text created_by "admin user id or self"
    text last_used_at
    text expires_at "reserved for future/expiring tokens"
    text revoked_at
    text created_at
  }
  sessions {
    text id PK
    integer user_id FK
    text token_hash "SHA-256 of cookie secret"
    text ip
    text user_agent
    text created_at
    text last_seen_at
    text expires_at
  }
  api_logs {
    integer id PK
    integer user_id "NULL if unauthenticated"
    text api_token_id
    text method
    text path
    integer status_code
    text ip
    text user_agent
    integer response_time_ms
    text created_at
  }
  audio_access_logs {
    integer id PK
    text audio_id FK
    integer status_code
    text ip
    text referer
    text user_agent
    text created_at
  }
  system_settings {
    text key PK
    text value
    text updated_at
  }
```

## Indexes

- `audio_files(user_id, created_at)` — per-user listing/sort
- `audio_files(visibility)`, `audio_files(status)`
- `api_tokens(user_id) WHERE revoked_at IS NULL` — **partial unique: at most one active token per user**; history preserved for revoke/regenerate audit
- `api_logs(created_at)`, `api_logs(user_id)`, `api_logs(status_code)`
- `audio_access_logs(audio_id, created_at)`
- `sessions(expires_at)`, `sessions(token_hash)`

## Settings keys (`system_settings`, env provides defaults on first boot)

| key | default (env) | purpose |
| --- | --- | --- |
| `api_rate_limit_per_minute` | `API_RATE_LIMIT` (100) | requests/min per API token |
| `upload_rate_limit_per_minute` | `UPLOAD_RATE_LIMIT` (10) | uploads/min per API token |
| `max_upload_size_mb` | `MAX_UPLOAD_SIZE_MB` (100) | per-file cap |
| `default_user_storage_limit_mb` | `USER_STORAGE_LIMIT_MB` (1024) | quota for users without explicit limit |
| `cors_allowed_origins` | `CORS_ALLOWED_ORIGINS` | comma-separated origins; empty = same-origin only, NEVER wildcard by default |

## Deletion semantics

- User delete (admin): cascade — stored bytes removed via StorageService, rows removed; `api_logs` retained with `user_id` kept for audit (integrity PRAGMA off for controlled manual cascade in service code).
- Audio delete: remove row, remove stored object, remove its access logs.
