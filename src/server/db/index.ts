import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { env } from "../env";
import * as schema from "./schema";

export type AppDatabase = BetterSQLite3Database<typeof schema>;

let client: Database.Database | null = null;
let db: AppDatabase | null = null;

export function getSqlite(): Database.Database {
  if (!client) {
    const file = path.resolve(env.dbSqlitePath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    client = new Database(file);
    client.pragma("journal_mode = WAL");
    client.pragma("foreign_keys = ON");
    client.pragma("busy_timeout = 5000");
  }
  return client;
}

export function getDb(): AppDatabase {
  if (!db) db = drizzle(getSqlite(), { schema });
  return db;
}

export function closeDb() {
  client?.close();
  client = null;
  db = null;
}
