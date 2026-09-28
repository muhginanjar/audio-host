# Audio Hosting & Delivery Platform

Upload, store, manage and distribute audio files — through a **Web dashboard**, a **REST API**, and **public playback/embed URLs** — with multi-user isolation, API tokens, rate limiting and logs.

| Interface | Entry point |
| --- | --- |
| Public playlist homepage | `/` — no login needed: all public audio, play inline, search/sort (sidebar only appears after login) |
| User dashboard | `/dashboard` (login) — own stats, own tracks, activity |
| Audio library | `/audio` — own files: detail, embed code, filters |
| Admin dashboard | `/admin` — users, tokens, all audio, API logs, system settings |
| REST API | `/api/v1` (Bearer token) — spec in `docs/03-api-spec.md`, in-app at `/docs` |
| Public feed API | `/api/public/feed` + `/api/public/feed/stats` — no auth, public files only |
| Playback / embed | `GET /a/{ULID}` (Range-aware stream) · `GET /embed/{ULID}` (iframe page) |
Stack: **Node 20+ · TypeScript · Hono · TanStack Router (SPA) · SQLite (Drizzle) · music-metadata** — one process, trivially deployed with **pm2**. Design docs: [`docs/`](docs/).

---

## 1. Local development

```bash
npm install
cp .env.example .env          # set APP_URL=http://localhost:3000
npm run dev                   # server :3000 + vite :5173 (proxied)
# first boot in another terminal:
npm run migrate
npm run create-admin -- --email admin@example.com --password 'change-me-123' --name "Site Admin"
```

Open http://localhost:5173 (or :3000 once built). `npm run build` produces `dist/` (SPA + server bundle).

## 2. VPS deployment (pm2) — recommended path

1. **Install dependencies** — Node ≥ 20.19 (tested on 22/24; 20.17 ke bawah gagal `npm i` karena TanStack/Vite butuh ≥20.19), git, nginx/Caddy:
   `curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs nginx && node -v`
2. **Get the code**: `git clone <repo> /opt/audio-host && cd /opt/audio-host`
3. **Setup database**: SQLite needs no server — `DB_SQLITE_PATH` points at `data/audio.sqlite` (auto-created, auto-migrated on boot; `npm run migrate` available for CI).
4. **Setup storage**: `STORAGE_ROOT=storage` — keep it **outside** any web root; the app streams it itself.
5. **Setup environment**: `cp .env.example .env`, set `APP_URL` (public https URL!), limits, `CORS_ALLOWED_ORIGINS`. No hardcoded credentials anywhere else.
6. **Migration**: automatic at startup; or explicit `npm run migrate`.
7. **Create admin** (exactly one): `npm run create-admin -- --email you@example.com --password 'S3cure!Passw0rd'`
8. **Queue worker**: not required — metadata extraction is in-process (see `docs/06-development-plan.md` for the queue seam).
9. **Web server**:

   ```nginx
   server {
     listen 443 ssl http2;
     server_name audio.example.com;
     ssl_certificate     /etc/letsencrypt/live/audio.example.com/fullchain.pem;
     ssl_certificate_key /etc/letsencrypt/live/audio.example.com/privkey.pem;
     client_max_body_size 256m;            # ≥ MAX_UPLOAD_SIZE_MB

     location / {
       proxy_pass http://127.0.0.1:3000;
       proxy_set_header Host $host;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
       proxy_buffering off;                # stream audio + live progress bars
       proxy_read_timeout 300s;
     }
   }
   ```

10. **SSL**: `sudo certbot --nginx -d audio.example.com` (set `APP_URL=https://…`; cookies auto-flip to Secure).
11. **Run with pm2**:

    ```bash
    npm ci && npm run build
    pm2 start ecosystem.config.cjs
    pm2 save && pm2 startup   # boot-persistence
    ```

12. **Test**:

    ```bash
    curl -s localhost:3000/api/health
    # create a user in the dashboard, copy its token, then:
    curl -X POST https://audio.example.com/api/v1/audio \
      -H "Authorization: Bearer aud_XXXXXXXX" -F "file=@podcast.mp3"
    curl -sI https://audio.example.com/a/<id-from-response> | head
    curl -s -H "Range: bytes=0-1023" -o /dev/null -w "%{http_code}\n" https://audio.example.com/a/<id>   # → 206
    ```

## 3. Docker alternative

```bash
docker compose up -d --build
docker compose exec app sh -c 'node dist/server/index.js &'   # auto on start; run create-admin via:
docker compose run --rm app sh -c "npx tsx scripts/create-admin.ts --email a@b.c --password 'secret12'"
```
`data/` and `storage/` are bind-mounted — backup = copy two directories.

## 4. API quickstart

```bash
curl -X POST https://audio.example.com/api/v1/audio \
  -H "Authorization: Bearer aud_xxxxxxxxxxxx" \
  -F "file=@episode.mp3" -F "title=Episode 01"

curl "https://audio.example.com/api/v1/audio?search=episode&sort=duration&order=desc&page=1" \
  -H "Authorization: Bearer aud_xxxxxxxxxxxx"
```
Full contract + PHP/JS/Python examples: `/docs` in the dashboard or `docs/03-api-spec.md`.

## 5. Operations

- **Logs**: `pm2 logs audio-host`. API traffic also lands in `api_logs` (Admin → API Logs, filter by user/endpoint/status/date).
- **Retention cron** (optional): raw log rows are pruned only via `pruneApiLogs(days)` in `src/server/services/api-log-service.ts` — wire to a scheduler if needed: `0 3 * * * curl …` is not provided; run a tiny tsx script calling it.
- **Backups**: `data/audio.sqlite` (WAL checkpoint: `sqlite3 data/audio.sqlite "VACUUM INTO 'backup.sqlite'"`) + `storage/` tree (rsync). ULID filenames never collide; date-partitioned.
- **Scaling**: single pm2 instance (in-memory rate windows + SQLite WAL). To go multi-instance: move limiter to Redis and DB to Postgres — seams documented in `docs/01-architecture.md`.
- **Troubleshooting**: `429` → check Admin → System Settings; uploads rejected → magic bytes must match extension (rename≠audio); stream 404 with row present → storage file missing (check `STORAGE_ROOT` perms, mode 0640/0750, owner = pm2 user).

## 6. Security posture (summary — full model in `docs/05-security.md`)

scrypt passwords · SHA-256-hashed API tokens shown once · ULID-named files outside web root · magic-byte + decode validation (never trust extension/MIME) · per-tenant SQL scoping + ULID-only path params · configurable rate limits · login lockout · allow-list CORS · hard security headers + CSP on embed pages · audit logs without raw tokens.
