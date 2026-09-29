import { z } from "zod";
import { ALLOWED_FORMATS } from "./filesniff";
import { badRequest } from "./errors";

/** Every client payload goes through a schema that STRIPS unknown keys —
 *  e.g. a submitted `user_id` is silently ignored (brief §13). */

export const loginSchema = z.object({
  email: z.email({ message: "A valid email address is required." }),
  password: z.string().min(1, "Password is required."),
});

export const passwordPolicy = z.string().min(8, "Password must be at least 8 characters.").max(200);

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters.").max(120),
  email: z.email({ message: "A valid email address is required." }),
  password: passwordPolicy,
  storage_limit_mb: z.coerce.number().int().positive().max(1_000_000).optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.email({ message: "A valid email address is required." }).optional(),
  storage_limit_mb: z.coerce.number().int().positive().max(1_000_000).nullable().optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const resetPasswordSchema = z.object({ password: passwordPolicy });
export const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: passwordPolicy,
});

const formatEnum = z.enum(Object.keys(ALLOWED_FORMATS) as [string, ...string[]], {
  message: `format must be one of: ${Object.keys(ALLOWED_FORMATS).join(", ")}`,
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  format: formatEnum.optional(),
  visibility: z.enum(["public", "private"]).optional(),
  sort: z.enum(["created_at", "updated_at", "title", "size", "duration", "play_count"]).default("created_at"),
  order: z.enum(["asc", "desc"]).default("desc"),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_from must be YYYY-MM-DD").optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_to must be YYYY-MM-DD").optional(),
  min_size: z.coerce.number().int().min(0).optional(),
  max_size: z.coerce.number().int().min(0).optional(),
  min_duration: z.coerce.number().min(0).optional(),
  max_duration: z.coerce.number().min(0).optional(),
  folder_id: z.string().trim().max(30).optional(),
});

export const createFolderSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required.").max(120),
  visibility: z.enum(["public", "private"]).default("private"),
  show_on_homepage: z.coerce.boolean().default(false),
});

export const patchFolderSchema = z
  .object({
    name: z.string().trim().min(1, "Folder name cannot be blank.").max(120).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    show_on_homepage: z.coerce.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update were provided" });

export const folderListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(200).optional(),
  visibility: z.enum(["public", "private"]).optional(),
  show_on_homepage: z.coerce.boolean().optional(),
});

export const adminAudioQuerySchema = listQuerySchema.extend({
  user_id: z.coerce.number().int().positive().optional(),
});

export const patchAudioSchema = z
  .object({
    title: z.string().trim().min(1, "title cannot be blank").max(300).optional(),
    description: z.string().trim().max(5000).optional(),
    visibility: z.enum(["public", "private"]).optional(),
    folder_id: z.string().trim().max(30).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields to update were provided" });

export const apiLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(50),
  user_id: z.coerce.number().int().positive().optional(),
  status: z.coerce.number().int().min(100).max(599).optional(),
  search: z.string().trim().max(200).optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_from must be YYYY-MM-DD").optional(),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date_to must be YYYY-MM-DD").optional(),
});

export const settingsPatchSchema = z.object({
  api_rate_limit_per_minute: z.coerce.number().int().positive().max(100_000).optional(),
  upload_rate_limit_per_minute: z.coerce.number().int().positive().max(10_000).optional(),
  max_upload_size_mb: z.coerce.number().int().positive().max(51_200).optional(),
  default_user_storage_limit_mb: z.coerce.number().int().positive().max(100_000_000).optional(),
  cors_allowed_origins: z.string().max(2000).optional(),
});

export const uploadFieldsSchema = z.object({
  title: z.string().trim().max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  visibility: z.enum(["public", "private"]).default("public"),
  folder_id: z.string().trim().max(30).optional(),
});

export function parseOrThrow<T>(schema: z.ZodType<T>, data: unknown): T {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw badRequest(first?.message ?? "Invalid request payload.", parsed.error.flatten());
  }
  return parsed.data;
}
