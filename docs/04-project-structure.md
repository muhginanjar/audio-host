# Project Structure

```
.
├── ecosystem.config.cjs      # pm2 app definition (single process)
├── vite.config.ts            # client build + dev proxy to :PORT
├── tsconfig.json
├── Dockerfile                # multi-stage: build → slim runtime
├── docker-compose.yml        # app (+ volume for data/storage)
├── .env.example
├── README.md                 # setup, pm2 deploy, API quickstart
├── docs/                     # this folder: design artifacts
│
├── src/
│   ├── shared/               # server ⇄ web contracts (no Node APIs here)
│   │   ├── types.ts          # DTOs: AudioDTO, UserDTO, ApiResult<T>, Meta
│   │   └── error-codes.ts    # union of error codes + HTTP mapping
│   │
│   ├── server/
│   │   ├── index.ts          # bootstrap: env, migrate, listen, graceful shutdown
│   │   ├── app.ts            # Hono factory: middleware order + mounts
│   │   ├── env.ts            # .env loader + typed config
│   │   │
│   │   ├── db/
│   │   │   ├── index.ts      # better-sqlite3 (WAL) + drizzle instance
│   │   │   ├── schema.ts     # drizzle table definitions (source of truth)
│   │   │   ├── migrations.ts # ordered SQL migrations (embedded strings)
│   │   │   ├── migrate.ts    # runner (_migrations table) — also used on boot
│   │   │   └── migrate-cli.ts# `npm run migrate`
│   │   │
│   │   ├── lib/
│   │   │   ├── errors.ts     # AppError + HttpError helpers
│   │   │   ├── crypto.ts     # scrypt hash/verify, sha256, random token/secret
│   │   │   ├── ids.ts        # ULID helpers
│   │   │   ├── ratelimit.ts  # fixed-window in-memory limiter (per-token/per-IP)
│   │   │   ├── filesniff.ts  # magic-byte validation per allowed format
│   │   │   ├── ranges.ts     # HTTP Range parse/validation
│   │   │   └── dates.ts      # ISO now, date-only helpers (day buckets)
│   │   │
│   │   ├── services/         # pure business logic, framework-free
│   │   │   ├── auth-service.ts
│   │   │   ├── user-service.ts
│   │   │   ├── token-service.ts
│   │   │   ├── audio-service.ts    # upload pipeline, listing, update, delete
│   │   │   ├── metadata-service.ts # music-metadata parse → row patch
│   │   │   ├── api-log-service.ts
│   │   │   ├── stats-service.ts
│   │   │   └── settings-service.ts # system_settings w/ env defaults
│   │   │
│   │   ├── storage/
│   │   │   ├── types.ts      # StorageDriver interface
│   │   │   ├── local.ts      # LocalStorage driver (dated dirs, ULID names)
│   │   │   ├── s3.ts         # (future) placeholder module contract only? NO — added with Phase 3; interface ready
│   │   │   └── index.ts      # getStorage() factory from STORAGE_DRIVER
│   │   │
│   │   ├── middleware/
│   │   │   ├── api-auth.ts   # Bearer → token → user (+ last_used touch)
│   │   │   ├── session-auth.ts
│   │   │   ├── cors.ts
│   │   │   ├── rate-limit.ts
│   │   │   └── errors.ts     # AppError → consistent JSON
│   │   │
│   │   └── routes/
│   │       ├── api-v1.ts     # REST contract endpoints
│   │       ├── client-auth.ts
│   │       ├── client-user.ts    # me/audio/stats/profile
│   │       ├── client-admin.ts   # admin ops
│   │       ├── media.ts      # /a/:id streaming (+Range) / stream parity
│   │       └── embed.ts      # /embed/:id SSR page
│   │
│   └── web/                  # TanStack Router SPA (Vite root)
│       ├── index.html
│       ├── main.tsx          # QueryClient + router mount
│       ├── routeTree.gen.ts  # generated
│       ├── styles.css        # Tailwind v4 + tokens
│       ├── lib/
│       │   ├── api.ts        # typed fetch wrapper (client + v1 helpers)
│       │   ├── auth.ts       # session hooks (useMe, requireRole)
│       │   └── format.ts     # bytes/duration/date display
│       ├── components/
│       │   ├── ui.tsx        # Button/Input/Card/Badge/Table/Modal/…
│       │   ├── Layout.tsx    # sidebar shell (user vs admin nav)
│       │   ├── AudioPlayer.tsx
│       │   ├── Dropzone.tsx  # drag&drop + progress upload
│       │   └── Copy.tsx      # copy URL / embed with feedback
│       └── routes/
│           ├── __root.tsx
│           ├── login.tsx
│           ├── _auth.tsx             # guard + layout (loader /me)
│           ├── _auth/index.tsx       # dashboard
│           ├── _auth/audio.tsx       # list + filters + detail modal
│           ├── _auth/upload.tsx
│           ├── _auth/docs.tsx        # API documentation page
│           ├── _auth/profile.tsx
│           └── _auth/admin/
│               ├── index.tsx         # overview
│               ├── users.index.tsx / users.new.tsx / users.$id.tsx
│               ├── audio.tsx
│               ├── logs.tsx
│               └── settings.tsx
│
├── scripts/
│   └── create-admin.ts       # interactive/flag CLI — the single admin bootstrap
├── data/                     # sqlite file (gitignored, created on boot)
└── storage/                  # uploaded bytes, outside web root (gitignored)
```

## Dependency rules

- `routes → middleware → services → storage|db → lib` — never reverse; `shared` imported by server & web; `services` never import Hono context.
- Build outputs: `dist/client` (static SPA) served by the Node process; `dist/server/index.js` is the pm2 entrypoint. Runtime data paths (`data/`, `storage/`) resolve from process cwd (pm2 sets `cwd`), configurable via `DB_SQLITE_PATH` / `STORAGE_ROOT`.
