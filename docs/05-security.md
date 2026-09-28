# Security Model

## Identity & credentials

| Concern | Decision |
| --- | --- |
| Password storage | scrypt (N=16384, r=8, p=1, 64-byte key, per-user 16-byte random salt), encoded `scrypt$16384$8$1$salt_b64$hash_b64`; verification with `timingSafeEqual`. Min 8 chars. |
| Single admin | `role='admin'` is only settable by `scripts/create-admin.ts`, which aborts if an admin already exists. No API can promote users. |
| Disabled users | `status='disabled'` blocks login, all API tokens (401 `UNAUTHORIZED`), and invalidates sessions on status change. |

## API tokens

- Format `aud_` + 48 hex chars (24 random bytes from `crypto.randomBytes`) — unguessable, user-ID never involved.
- Stored **only as SHA-256 hash**; `token_prefix` (first 8) + `token_suffix` (last 4) kept for UI identification. Raw token appears once, in the create/regenerate response.
- Lookup by hash on a UNIQUE index; revoked tokens (`revoked_at`) rejected; regenerate = revoke old row + insert new (old invalid immediately). At most one active token per user (partial unique index).
- `last_used_at` touched per authenticated request (feeds admin "Last API Request").
- Raw tokens never logged; `api_logs` stores token ID only.

## Sessions (Web GUI)

- 32 random bytes as cookie `sid`; DB stores SHA-256 hash; 14-day absolute expiry, sliding `last_seen`.
- Cookie flags: `HttpOnly`, `SameSite=Lax`, `Secure` when `COOKIE_SECURE=1` (behind TLS).
- CSRF: SameSite=Lax blocks cross-site POST cookies; mutations additionally require `Content-Type: application/json` (non-CORS-simple) or multipart via same-site forms; no state change on GET.
- Logout deletes session row; disabling/resetting a user deletes their sessions.

## Upload & file handling

Chain, all mandatory before a row is committed:

1. `Content-Length` pre-check + actual byte cap → 413 `PAYLOAD_TOO_LARGE` (`max_upload_size_mb`).
2. Extension ∈ {mp3, wav, m4a, aac, ogg, flac} → else 422 `INVALID_FILE_TYPE`.
3. **Magic-byte sniffing** (`file-type` + explicit per-format header rules: ID3/MPEG sync, RIFF/WAVE, fLaC, OggS, ISO-BMFF `ftyp`, ADTS) against the declared extension — client MIME header is never trusted.
4. Real decode via `music-metadata`; failure → 422 `INVALID_FILE` (corrupt / not audio). Successful parse also yields authoritative container/codec/duration/bitrate/sample-rate/channels/tags.
5. Quota: user's `storage_limit_bytes` (explicit or system default) → 422 `STORAGE_LIMIT_EXCEEDED`.

Filesystem:

- Storage root is **outside** the web root; the SPA/static handler never sees it. Bytes reachable only through `/a/:id` authorization route.
- Stored name = `{ULID}.{ext}` under `storage/audio/YYYY/MM/DD/`; original filename only ever a DB string (sanitized, 255 cap) used in `Content-Disposition` after `filename*=UTF-8''` encoding.
- `id` path param validated against `/^[0-9A-Z]{26}$/` → path traversal impossible; driver joins under root with containment assert.
- Uploaded bytes are never executable (no script extensions can result from ULID naming; nothing is served with JS handler semantics; `X-Content-Type-Options: nosniff`).

## Tenant isolation (multi-user)

- Principal (session user or token user) is the **only** source of `user_id`. Incoming `user_id` fields are stripped by validation schemas (zod strips unknown/extra keys) and ignored.
- Every audio query is `(id AND user_id = principal)`; admin endpoints add an explicit role check before crossing tenants.
- Cross-tenant access returns **404** (not 403) to prevent ID enumeration.

## API defenses

- Rate limiting (fixed window, in-memory; single pm2 instance — Redis adapter slot left in `lib/ratelimit.ts` interface):
  - `/api/v1/*`: 100 req/min/token; uploads: 10/min/token; both configurable in admin settings.
  - Login: 10 per IP+email / 15 min.
  - 429 with `Retry-After` + standard error body; headers `X-RateLimit-Limit/Remaining`.
- CORS allow-list from `cors_allowed_origins`; empty = same-origin only; wildcard only if admin explicitly sets `*`. Reflects exact origin, `Vary: Origin`.
- Uniform auth errors (no "user exists"/"token for id X" leaks).

## Response hardening

- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()` globally; `X-Frame-Options: DENY` for SPA/app; `/embed/:id` instead CSP `frame-ancestors *` + `media-src 'self' {APP_URL}` + inline-style allowance, HTML-escaped output.
- Range responses: single-range only, validated; unsatisfiable → 416; Content-Length exact per slice (response-splitting safe).

## Data hygiene

- Secrets exclusively via `.env` (never committed; `.env.example` documents). No hardcoded credentials.
- `api_logs`/`audio_access_logs` store IP + UA for abuse tracing; retention is an operational knob (cleanup cron documented, no PII beyond that).
- SQLite opened with `journal_mode=WAL`, `foreign_keys=ON`, `busy_timeout=5000`.
