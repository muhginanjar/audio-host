/**
 * Storage abstraction (brief §14). Keys are POSIX-style relative paths
 * (e.g. "audio/2026/09/28/01JXYZ….mp3") — drivers resolve them against their
 * own root/bucket. S3/R2/Wasabi/MinIO drivers implement this same contract;
 * business logic never touches fs directly.
 */
export interface StorageDriver {
  readonly disk: string;
  put(key: string, data: Buffer): Promise<void>;
  /** Open a byte slice as a WHATWG stream for Response bodies. Null when absent. */
  open(key: string, opts?: { start?: number; end?: number }): Promise<ReadableStream<Uint8Array> | null>;
  stat(key: string): Promise<{ size: number } | null>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
}
