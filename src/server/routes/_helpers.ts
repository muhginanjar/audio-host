import { eq, sql } from "drizzle-orm";
import { getDb } from "../db";
import { audioFiles } from "../db/schema";
import type { AudioFileRow, UserRow } from "../db/schema";
import { badRequest, noFileProvided } from "../lib/errors";
import { parseOrThrow, uploadFieldsSchema } from "../lib/validation";
import { storageUsage } from "../services/user-service";
import { tokenInfoFor } from "../services/token-service";
import { uploadAudio } from "../services/audio-service";
import type { MeDTO } from "../../shared/types";

export function buildMeDTO(user: UserRow): MeDTO {
  const audioCount =
    getDb()
      .select({ n: sql<number>`COUNT(*)` })
      .from(audioFiles)
      .where(eq(audioFiles.userId, user.id))
      .get()?.n ?? 0;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.createdAt,
    last_login_at: user.lastLoginAt,
    audio_count: audioCount,
    storage: storageUsage(user),
    token: tokenInfoFor(user.id),
  };
}

export function strOrUndef(value: FormDataEntryValue | null): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/**
 * Shared multipart upload handler for BOTH interfaces (REST v1 + GUI client API)
 * so the validation pipeline lives in exactly one place.
 */
export async function uploadAudioFromForm(
  req: { header(name: string): string | undefined; formData(): Promise<FormData> },
  user: UserRow,
): Promise<AudioFileRow> {
  const contentType = req.header("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    throw badRequest('Content-Type must be "multipart/form-data" with a "file" field.');
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw badRequest("Malformed multipart body.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw noFileProvided('Attach the audio file under the form field name "file".');

  const fields = parseOrThrow(uploadFieldsSchema, {
    title: strOrUndef(form.get("title")),
    description: strOrUndef(form.get("description")),
    visibility: strOrUndef(form.get("visibility")),
  });

  return uploadAudio(user, {
    buffer: Buffer.from(await file.arrayBuffer()),
    originalFilename: file.name,
    ...fields,
  });
}
