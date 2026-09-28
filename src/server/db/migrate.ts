import type Database from "better-sqlite3";
import { MIGRATIONS } from "./migrations";
import { isoNow } from "../lib/dates";

export function runMigrations(client: Database.Database): string[] {
  client.exec(
    "CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set<string>(
    (client.prepare("SELECT id FROM _migrations").all() as { id: string }[]).map((r) => r.id),
  );

  const newly: string[] = [];
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    client.transaction(() => {
      client.exec(m.sql);
      client.prepare("INSERT INTO _migrations (id, applied_at) VALUES (?, ?)").run(m.id, isoNow());
    })();
    newly.push(m.id);
  }
  return newly;
}
