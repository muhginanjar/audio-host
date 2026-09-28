# Development Plan (brief §38 mapped to this repo)

## Phase 1 — Core MVP ✅ (built here)

| # | Item | Implementation |
| --- | --- | --- |
| 1 | Authentication | scrypt passwords, session cookie (GUI), Bearer API tokens |
| 2 | Admin | single admin via `create-admin` CLI, admin section in SPA |
| 3 | User management | CRUD, enable/disable, reset password, storage limits |
| 4 | API Token | generate/revoke/regenerate, hashed, shown-once |
| 5 | Audio upload | GUI (drag&drop + progress) & REST multipart, full validation chain |
| 6 | Audio storage | `StorageDriver` abstraction, LocalStorage dated dirs, ULID names |
| 7 | Audio list | paginated table, search/filter/sort (GUI + API) |
| 8 | Audio playback | `/a/:id` Range streaming + native `<audio controls>` |
| 9 | Public URL | `{APP_URL}/a/{ULID}` |
| 10 | Embed | copy `<audio>` snippet + iframe `/embed/{id}` SSR minimal player |
| 11 | Basic REST API | `/api/v1/{me,audio…}` per spec doc |

## Phase 2 — operational depth ✅ (built here)

Metadata (duration/bitrate/sample rate/channels/tags via `music-metadata`) · API documentation page (`/docs`, cURL/JS/PHP/Python) · `api_logs` + admin viewer with user/endpoint/status/date filters · rate limiting (per-token + upload buckets) · storage statistics (per user, system) · search & filtering · activity-aware dashboard.

## Phase 3 — future (architecture-ready, NOT implemented)

S3/R2/Wasabi driver (interface + `storage_disk` column exist) · private audio serving rules (`visibility` column exists; MVP stores/validates it, MVP streams public only, private→403) · signed/expiring URLs · chunked/resumable upload · webhooks (service layer emits mutation points) · advanced analytics (`audio_access_logs` already captured).

## Background processing decision (§26)

MVP extracts metadata **synchronously** because `music-metadata` is in-process and sub-100ms for typical files — a queue would add ops burden with no user-visible gain. The seam is preserved: `audio_files.status` (`pending|ready|error`), idempotent `metadataService.applyMetadata(audioId)`, and `audio-service` upload flow that calls it through one function → switching to enqueue+worker touches one line.

## Verification plan (run before "done")

1. `npm run build` clean (typecheck + vite + esbuild).
2. Boot with fresh DB → migrations apply → `create-admin` → login via curl.
3. API E2E: 401 no/bad token → create user → token plaintext once → upload real MP3/WAV/M4A (generated fixtures) → list/search/pagination → detail → PATCH → `GET /a/:id` 200 + 206 Range + 416 → embed 200 HTML → foreign-user 404 → rename-`php`-as-`mp3` rejected 422 → oversized 413 → quota 422 → rate limit 429 + `Retry-After` → revoke → old token 401 → delete → bytes gone.
4. Browser UI: admin login → create user → copy token → user login → drag-upload → play → copy URL/embed → detail stats → profile regenerate → admin users/audio/logs/settings pages.
5. pm2: `pm2 start ecosystem.config.cjs` serves SPA+API+streaming from `dist/server/index.js`.
