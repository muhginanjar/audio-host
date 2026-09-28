import { parseFile } from "music-metadata";
import { getStorage } from "../storage";
import { invalidFile } from "../lib/errors";

export interface ExtractedMetadata {
  duration: number | null;
  bitrate: number | null;
  sampleRate: number | null;
  channels: number | null;
  format: string | null;
  codec: string | null;
  artist: string | null;
  album: string | null;
  titleTag: string | null;
}

/**
 * Authoritative decode (brief §5/§15 — "don't only trust the extension").
 * Runs in-process via music-metadata (ms-scale). Kept behind one idempotent
 * function so a queue worker can call the same code later (§26).
 */
export async function extractMetadata(storageKey: string): Promise<ExtractedMetadata> {
  const abs = getStorage().absolutePath(storageKey);
  let meta;
  try {
    meta = await parseFile(abs, { duration: true });
  } catch (err) {
    if (err instanceof Error && /Unsupported|Could not determine|Unexpected/i.test(err.message)) {
      throw invalidFile(`The file could not be decoded as audio: ${err.message}`);
    }
    throw invalidFile("The audio file could not be parsed and may be corrupt.");
  }

  const { format, common } = meta;
  if (!format.duration || Number.isNaN(format.duration)) {
    // A stream without any determinable duration is treated as unparseable here.
    throw invalidFile("No playable audio stream was found in this file.");
  }

  return {
    duration: Math.round(format.duration * 1000) / 1000,
    bitrate: format.bitrate ? Math.round(format.bitrate) : null,
    sampleRate: format.sampleRate ?? null,
    channels: format.numberOfChannels ?? null,
    format: format.container ?? null,
    codec: format.codec ?? null,
    artist: cleanTag(common.artist),
    album: cleanTag(common.album),
    titleTag: cleanTag(common.title),
  };
}

function cleanTag(value: string | string[] | undefined): string | null {
  const v = Array.isArray(value) ? value.join(", ") : value;
  if (!v) return null;
  return v.slice(0, 255);
}
