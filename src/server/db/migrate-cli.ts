import { getSqlite, closeDb } from "./index";
import { runMigrations } from "./migrate";

const applied = runMigrations(getSqlite());
console.log(applied.length ? `Migrations applied: ${applied.join(", ")}` : "Database already up to date.");
closeDb();
