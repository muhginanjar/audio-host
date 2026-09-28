import crypto from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT_PARAMS);
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, nStr, rStr, pStr, saltB64, keyB64] = parts;
  try {
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(keyB64, "base64");
    const N = Number(nStr);
    const r = Number(rStr);
    const p = Number(pStr);
    const key = await scrypt(password.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: Math.max(SCRYPT_PARAMS.maxmem, N * r * 2),
    });
    return crypto.timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

export function sha256Hex(input: string): string {
  return crypto.createHash("sha256").update(input, "utf8").digest("hex");
}

/** API token: aud_ + 48 hex chars (24 random bytes). Never derived from user id. */
export function generateApiToken(): string {
  return `aud_${crypto.randomBytes(24).toString("hex")}`;
}

export function generateSessionSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}
