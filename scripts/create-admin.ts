#!/usr/bin/env tsx
/**
 * Bootstrap the single system administrator (brief §2: exactly one admin).
 * Re-runnable only in the "no admin yet" state; use the dashboard afterwards.
 *
 * Usage:
 *   npm run create-admin -- --email admin@example.com --password 's3cret!' --name "Site Admin"
 *   npm run create-admin                      # interactive prompts
 */
import readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { getSqlite, closeDb } from "../src/server/db";
import { runMigrations } from "../src/server/db/migrate";
import { createUserWithPassword, findUserByEmail } from "../src/server/services/auth-service";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(`--${flag}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const client = getSqlite();
  runMigrations(client);

  const existingAdmin = client
    .prepare("SELECT email FROM users WHERE role = 'admin' LIMIT 1")
    .get() as { email: string } | undefined;
  if (existingAdmin) {
    console.error(`An administrator already exists: ${existingAdmin.email}`);
    console.error("This system allows exactly one admin. Reset it via the dashboard or delete the row manually.");
    process.exitCode = 1;
    closeDb();
    return;
  }

  let email = arg("email");
  let password = arg("password");
  let name = arg("name");

  if (!email || !password || !name) {
    const rl = readline.createInterface({ input: stdin, output: stdout });
    email ??= await rl.question("Admin email: ");
    name ??= await rl.question("Admin name: ");
    password ??= await rl.question("Admin password (min 8 chars): ");
    rl.close();
  }

  email = email.trim().toLowerCase();
  name = (name ?? "Administrator").trim();
  password = (password ?? "").trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    console.error(`Invalid email: ${email}`);
    process.exitCode = 1;
    closeDb();
    return;
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exitCode = 1;
    closeDb();
    return;
  }

  if (findUserByEmail(email)) {
    console.error(`A user with that email already exists: ${email}`);
    process.exitCode = 1;
    closeDb();
    return;
  }

  const admin = await createUserWithPassword(email, password, name, "admin");
  console.log(`Administrator created: ${admin.email} (#${admin.id})`);
  console.log("Log in via the dashboard. Admins manage users and API tokens there.");
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
