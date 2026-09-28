# MEMORY — Audio Hosting & Delivery Platform (`/v2`)

> Status per 2026-09-28 malam. Semua klaim di bawah sudah dieksekusi di mesin ini, bukan rencana.

## 1. Keputusan stack (hasil riset, bukan tebakan)

- **laju.dev = "Laju Go"**: boilerplate Go (Go Fiber + Inertia.js + SQLite). Ditolak untuk target deploy pm2 — pm2 itu process manager Node; Go butuh toolchain & systemd, bukan pm2.
- **Dipakai: TanStack (Router SPA + Query) + Hono (Node, 1 proses) + SQLite (better-sqlite3 + Drizzle) + music-metadata**. 1 proses pm2 menyajikan SPA + REST API + streaming audio. `npm run build` → `dist/client` + `dist/server/index.js`.

## 2. Status build

- Struktur lengkap: `src/server` (app, routes, middleware, services, storage, db/migrations), `src/shared` (DTO + error codes), `src/web` (TanStack Router file-based, 18 route files), `scripts/create-admin.ts`, `docs/01–06` (arsitektur, ERD, API spec, struktur, security, plan), `.env.example`, `ecosystem.config.cjs`, `Dockerfile`, `docker-compose.yml`, `README.md` (deploy 12 langkah).
- **`npx tsc --noEmit` = 0 error. `npx vite build` OK. esbuild bundle OK.** `dist/` up-to-date (tidak ada source lebih baru dari bundle).
- DB lokal: `data/audio.sqlite` (4 users: admin@test.io + rudi/other/quota; 1 audio m4a milik rudi — file wav rudi dihapus saat test DELETE).
## 2b. Perubahan: "/" = playlist publik ala Spotify, tanpa sidebar bila belum login (2026-09-28 sore, atas permintaan user)

- `/` publik tanpa auth: header ramping + footer saja (sidebar HANYA muncul setelah login), daftar bernomor ala playlist (judul, pemilik, plays, durasi, waktu), search + sort, play inline + sticky player bar (prev/stop/next + eq bars animasi CSS `.eq`).
- API publik baru: `GET /api/public/feed` + `GET /api/public/feed/stats` (tanpa auth, selalu `visibility='public'`); endpoint lama `/api/client/feed*` tetap jalan.
- Dashboard pribadi pindah ke `/dashboard` (statistik + track milik sendiri + aktivitas); nav sidebar: Home `/`, Dashboard `/dashboard`.
- Private tidak pernah bocor ke feed/stats (terverifikasi: set private → hilang; set public → muncul; play_count publik ikut terhitung di stats).
## 3. Yang SUDAH terverifikasi (curl, port 3999 + :3000)

Auth & token: create-admin → login cookie → admin create user (token plaintext sekali) → user login → v1 `/me` Bearer. Regenerate matikan token lama (401), revoke → 401, Bearer salah → 401.
Upload: WAV+M4A via v1 OK + metadata benar (WAVE/PCM 705600bps, AAC). PHP-disguise-.mp3 → 422 INVALID_FILE_TYPE. Oversize → 413. Kuota user 1MB + file 1.5MB → 422 STORAGE_LIMIT_EXCEEDED.
Streaming: `/a/:id` 200 full (audio/mp4, 12431B), `Range: bytes=0-1023` → 206 + Content-Range benar, range mustahil → 416, `?dl=1` → attachment, file hilang pasca-DELETE → 404. `/embed/:id` → HTML player minimal.
API: list + `meta{page,per_page,total,total_pages}`, search/sort, detail+stats (play_count naik tiap full GET), PATCH ignore `user_id` kiriman client, DELETE owner 200.
Admin API: overview (total/users/audio/storage/hari ini), users list (audio_count+storage benar), api-logs tercatat tiap request v1, settings PATCH tersimpan & live.
Agregat drizzle: **BUG ketahuan** — `${users.id}` di-render `"id"` tanpa prefix → di subquery resolve ke `audio_files.id` (=0 semua). Diperbaiki: 3 query (listUsers, getUserAdminDTO, admin top-users) diganti raw prepared SQL `u.id` eksplisit; terverifikasi benar di response.
Scrypt: **BUG ketahuan** — `verifyPassword` cek `parts.length !== 5` padahal format 6 field → semua login gagal. Diperbaiki → login OK.

## 4. SISA KERJA (belum dieksekusi)

1. **Browser UI smoke** (§37 plan): admin login→create user via GUI→copy token; user login→drag-upload→play→copy URL/embed→detail stats→profile regenerate; halaman admin users/audio/logs/settings. SPA sudah render (login page tampil benar di Chromium).
2. **pm2**: `pm2` belum terinstal di mesin ini — verifikasi `pm2 start ecosystem.config.cjs` belum jalan (bundle `dist/server/index.js` sendiri sudah terbukti jalan).
3. Bersih-bersih: hentikan `node dist/server/index.js` dev bila selesai; file `/tmp` (jar/token/fixture/log) di luar repo, aman diabaikan.

## 5. Cara run (mesin ini)

- Dev: `npm run dev` (server :3000 + vite :5173). Butuh Node **v24** (atau rebuild better-sqlite3 utk versi lain — ABI native!).
- Prod lokal: `npm run build && node dist/server/index.js` (baca `.env`: PORT/HOST/APP_URL).
- Admin pertama: `npm run create-admin -- --email x@y --password 'min8char'`.
- Fixture audio: `/tmp/tone.wav` (WAV 2 dtk), `/tmp/tone.m4a` (AAC), `/tmp/evil.mp3` (PHP disguise). Password test: admin `admpass123`, rudi `rudipass123`.
- Tidak ada `jq` di mesin — pakai `python3 -c json` untuk parsing curl.

## 6. Catatan teknis penting

- `audio_files.status` (`pending|ready|error`) + `metadataService` idempoten = seam untuk queue worker kelak (§26); metadata MVP sinkron (ms-scale).
- `visibility` private sudah divalidasi & disimpan; streaming private → 403 (signed URL = Phase 3).
- Rate limiter in-memory → 1 instance pm2 (`instances: 1` di ecosystem). Multi-instance butuh Redis (interface siap).
- `system_settings` cache in-memory per proses; PATCH settings invalidate cache.
- `.env` lokal: PORT=3000, batas longgar (100/10). Test ketat (2MB/30/3) dulu via env override, lalu settings DB dikembalikan longgar.
