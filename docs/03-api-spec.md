# API Specification

## Conventions

- Base URL: `{APP_URL}/api/v1`
- Auth (REST): `Authorization: Bearer aud_<token>`
- Success: `{ "success": true, "data": … , "meta"?: … }`
- Error: `{ "success": false, "error": { "code": "…", "message": "…" } }`
- Timestamps ISO-8601 UTC. IDs are ULIDs (`01J…`), never filesystem paths, never user IDs.

### Error codes → HTTP status

| code | status |
| --- | --- |
| `VALIDATION_ERROR` | 400 |
| `UNAUTHORIZED` (missing/bad token, disabled user) | 401 |
| `TOKEN_REVOKED` | 401 |
| `FORBIDDEN` | 403 |
| `NOT_FOUND` | 404 |
| `INVALID_FILE_TYPE` | 422 |
| `INVALID_FILE` (corrupt/unparseable) | 422 |
| `NO_FILE_PROVIDED` | 400 |
| `STORAGE_LIMIT_EXCEEDED` | 422 |
| `PAYLOAD_TOO_LARGE` | 413 |
| `RATE_LIMITED` | 429 (+ `Retry-After`) |
| `INTERNAL_ERROR` | 500 |

Rate-limited & JSON errors also carry `X-RateLimit-Limit` / `X-RateLimit-Remaining` on authenticated API calls.

---

## REST API v1 (Bearer token)

### `GET /api/v1/me`
→ `{ id, name, email, role, created_at, storage: { limit_bytes, used_bytes, remaining_bytes, percent_used }, audio_count, token: { prefix, masked, last_used_at } }`

### `POST /api/v1/audio`  — `multipart/form-data`
fields: `file` (required), `title?`, `description?`, `visibility? (public|private, default public)`
- 413 if > `max_upload_size_mb`; 422 `INVALID_FILE_TYPE` (magic bytes/extension/MIME mismatch); 422 `INVALID_FILE` if audio unparseable; 422 `STORAGE_LIMIT_EXCEEDED`.
→ `201 { id, filename(original), title, description, mime_type, extension, size, duration, bitrate, sample_rate, channels, format, codec, visibility, url, embed_url, download_url, created_at }`

### `GET /api/v1/audio`
query: `page=1` `per_page=20 (max 100)` `search=` (filename/title/description) `format=` (mp3|wav|m4a|aac|ogg|flac) `visibility=` `sort=created_at|title|size|duration|updated_at` `order=asc|desc`
→ `{ data: [Audio], meta: { page, per_page, total, total_pages } }`

### `GET /api/v1/audio/{id}` → Audio + `stats: { play_count }` · 404 if not owner (never reveals existence across tenants)

### `PATCH /api/v1/audio/{id}` — JSON: `title?`, `description?`, `visibility?` (own files only) → updated Audio

### `DELETE /api/v1/audio/{id}` → `{ success: true, data: { deleted: true, id } }` (removes bytes + row + access logs)

Audio object fields: `id, filename, title, description, mime_type, extension, size, duration, bitrate, sample_rate, channels, format, codec, artist, album, visibility, url, embed_url, download_url, play_count, created_at, updated_at`.

---

## Media & embed (no token required for public audio)

- `GET /a/{id}` — audio bytes; `Accept-Ranges: bytes`, HTTP **206** partial support (seek in players), `Content-Type` from stored MIME, `Cache-Control: public, max-age=31536000, immutable`. `?dl=1` → `Content-Disposition: attachment`. Private visibility → 403.
- `GET /embed/{id}` — minimal responsive HTML5 player page (iframe-able; CSP allows framing; `<audio controls preload="metadata">` + title).
- `GET /api/v1/audio/{id}/stream` — same handler behind Bearer (for private/future signed flows parity).
- Access to `/a/` and stream is logged into `audio_access_logs` (referer/ip/ua/status), play counter increments on non-range-repeat views.

---

## Client API (session cookie; powers the SPA; NOT part of public contract)

Namespace `/api/client`, all require valid session unless marked; `admin` role enforced under `/admin/*`.

- `POST /auth/login {email,password}` · `POST /auth/logout`
- `GET  /me` → user + storage usage + token info + is_admin
- `POST /profile/password {current_password,new_password}`
- `POST /profile/token/regenerate` → `{ token }` (shown once; old dies)
- `POST /audio` (multipart, same pipeline as v1) · `GET /audio` (same filters + `?scope=all` only for admin list page) · `GET/PATCH/DELETE /audio/{id}`
- `GET /stats` → dashboard: totals, uploads today, recent audio, recent activity (api + play events merged)
- Admin:
  - `GET /admin/overview` → total users/audio/storage, uploads today, API requests today, top storage users
  - `GET /admin/users?search=&page=` · `POST /admin/users {name,email,password,storage_limit_mb?,status}` (creates token, returns full plaintext once) · `GET /admin/users/{id}` · `PATCH /admin/users/{id} {name?,email?,status?,storage_limit_mb?}` · `POST /admin/users/{id}/reset-password {password}` · `POST /admin/users/{id}/token/regenerate` · `POST /admin/users/{id}/token/revoke` · `DELETE /admin/users/{id}`
  - `GET /admin/audio?user_id=&search=&page=` · `DELETE /admin/audio/{id}`
  - `GET /admin/api-logs?user_id=&status=&search=&date_from=&date_to=&page=`
  - `GET /admin/settings` · `PATCH /admin/settings {key:value,…}`

Login is rate-limited per IP+email (10 attempts / 15 min → 429).

---

## Rate limiting (REST API)

Fixed-window counters keyed by API token ID (config in `system_settings`):
- `api_rate_limit_per_minute` (default 100) — all `/api/v1/*`
- `upload_rate_limit_per_minute` (default 10) — `POST /api/v1/audio`
429 body uses standard error format with `Retry-After` seconds. Unauthenticated requests rejected 401 before counting.

## CORS

Applied to `/api/v1/*`. Origins from `cors_allowed_origins` setting (exact match). Empty → cross-origin blocked (same-origin only). `OPTIONS` preflights allowed methods/headers (`Authorization`, `Content-Type`). Never `*` unless admin explicitly sets it.
