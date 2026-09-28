import { fileTypeFromBuffer } from "file-type";
import type { ErrorCode } from "../../shared/error-codes";

/** Canonical extension → the one MIME type the platform serves for it. */
export const ALLOWED_FORMATS: Record<string, string> = {
  mp3: "audio/mpeg",
  wav: "audio/wav",
  m4a: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  flac: "audio/flac",
};

/** Detected (magic-byte) extensions we accept for each declared extension. */
const ACCEPTED_DETECTED: Record<string, string[]> = {
  mp3: ["mp3"],
  wav: ["wav", "wave"],
  m4a: ["m4a", "mp4", "m4b"],
  aac: ["aac", "mp4", "m4a"],
  ogg: ["ogg", "oga", "opus", "spx", "flac"],
  flac: ["flac", "oga"],
};

export type SniffResult =
  | { ok: true; extension: string; mimeType: string; detected: { ext: string; mime: string } }
  | { ok: false; code: ErrorCode; message: string };

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot + 1).toLowerCase();
}

/**
 * Validates the declared extension against real magic bytes (never trusts
 * filename/client MIME). Authoritative decode happens after via music-metadata.
 */
export async function sniffAudioFile(buffer: Buffer, originalFilename: string): Promise<SniffResult> {
  const ext = extensionOf(originalFilename);
  if (!ext) {
    return { ok: false, code: "VALIDATION_ERROR", message: "File must have an extension (e.g. song.mp3)." };
  }
  if (!(ext in ALLOWED_FORMATS)) {
    return {
      ok: false,
      code: "INVALID_FILE_TYPE",
      message: `Unsupported file extension ".${ext}". Allowed: ${Object.keys(ALLOWED_FORMATS).join(", ")}.`,
    };
  }
  if (buffer.length === 0) {
    return { ok: false, code: "INVALID_FILE", message: "The uploaded file is empty." };
  }

  const detected = await fileTypeFromBuffer(buffer);
  if (!detected) {
    return {
      ok: false,
      code: "INVALID_FILE_TYPE",
      message: "File contents do not match a recognized audio format.",
    };
  }
  const accepted = ACCEPTED_DETECTED[ext];
  if (!accepted.includes(detected.ext)) {
    return {
      ok: false,
      code: "INVALID_FILE_TYPE",
      message: `File contents are "${detected.ext}" (${detected.mime}) but the extension claims ".${ext}".`,
    };
  }

  return {
    ok: true,
    extension: ext,
    mimeType: ALLOWED_FORMATS[ext],
    detected: { ext: detected.ext, mime: detected.mime },
  };
}
