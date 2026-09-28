import path from "node:path";
import { env } from "../env";
import { LocalStorage } from "./local";

export type { StorageDriver } from "./types";

let storage: LocalStorage | null = null;

/**
 * Driver factory from STORAGE_DRIVER. Phase 3 adds `s3`/`r2` here (same
 * StorageDriver contract) — no business logic changes, records already store
 * storage_disk + storage_path.
 */
export function getStorage(): LocalStorage {
  if (!storage) {
    if (env.storageDriver !== "local") {
      throw new Error(`Unsupported STORAGE_DRIVER "${env.storageDriver}" — only "local" is implemented in this build.`);
    }
    storage = new LocalStorage(env.storageRoot);
  }
  return storage;
}

/** Key layout: audio/2026/09/28/01JXYZ123ABC.mp3 */
export function storageKeyFor(id: string, extension: string, createdAtIso: string): string {
  return path.posix.join(
    "audio",
    createdAtIso.slice(0, 4),
    createdAtIso.slice(5, 7),
    createdAtIso.slice(8, 10),
    `${id}.${extension}`,
  );
}
