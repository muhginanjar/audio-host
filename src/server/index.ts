import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { env } from "./env";
import { getSqlite, closeDb } from "./db";
import { runMigrations } from "./db/migrate";
import { pruneSessions } from "./services/auth-service";
import { apiLimiter } from "./middleware/rate-limit";

const client = getSqlite();
const applied = runMigrations(client);
if (applied.length) console.log(`[db] migrations applied: ${applied.join(", ")}`);

pruneSessions();
const sweep = setInterval(() => {
  apiLimiter.sweep();
  pruneSessions();
}, 10 * 60_000);
sweep.unref();

const app = createApp();
const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host });

console.log(`[audio-host] listening on http://${env.host}:${env.port} (APP_URL=${env.appUrl})`);
console.log(`[audio-host] storage: driver=${env.storageDriver} root=${env.storageRoot} db=${env.dbSqlitePath}`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`[audio-host] ${signal} received, shutting down…`);
    server.close(() => process.exit(0));
    closeDb();
    setTimeout(() => process.exit(0), 3000).unref();
  });
}
