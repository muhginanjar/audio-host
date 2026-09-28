import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import type { StorageDriver } from "./types";

/**
 * Files live under `root/audio/YYYY/MM/DD/ULID.ext`. `root` must be outside
 * the served web directory — the SPA static handler never reaches this tree.
 */
export class LocalStorage implements StorageDriver {
  readonly disk = "local";

  constructor(private root: string) {}

  /** Resolve key → absolute path, asserting containment under root (no traversal). */
  private resolve(key: string): string {
    if (key.startsWith("/") || key.includes("..") || /^[a-zA-Z]:/.test(key)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const abs = path.resolve(this.root, key);
    const rootAbs = path.resolve(this.root);
    if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    return abs;
  }

  async put(key: string, data: Buffer): Promise<void> {
    const abs = this.resolve(key);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true, mode: 0o750 });
    await fs.promises.writeFile(abs, data, { mode: 0o640 });
  }

  async open(key: string, opts?: { start?: number; end?: number }) {
    const abs = this.resolve(key);
    if (!(await this.exists(key))) return null;
    const rs = fs.createReadStream(abs, { start: opts?.start, end: opts?.end });
    return Readable.toWeb(rs) as unknown as ReadableStream<Uint8Array>;
  }

  async stat(key: string) {
    try {
      const st = await fs.promises.stat(this.resolve(key));
      return st.isFile() ? { size: st.size } : null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    await fs.promises.rm(this.resolve(key), { force: true });
  }

  async exists(key: string): Promise<boolean> {
    try {
      await fs.promises.access(this.resolve(key), fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /** Absolute path for in-process readers (metadata parsing). Same containment guard. */
  absolutePath(key: string): string {
    return this.resolve(key);
  }
}
