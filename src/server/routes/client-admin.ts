import type { Context } from "hono";
import { Hono } from "hono";
import { requireAdmin, requireSession, type SessionEnv } from "../middleware/session-auth";
import { badRequest, notFound } from "../lib/errors";
import { normalizeId } from "../lib/http";
import {
  adminAudioQuerySchema,
  apiLogQuerySchema,
  createUserSchema,
  parseOrThrow,
  resetPasswordSchema,
  settingsPatchSchema,
  updateUserSchema,
} from "../lib/validation";
import {
  createUser,
  deleteUser,
  getUserAdminDTO,
  getUserOrThrow,
  listUsers,
  resetPassword,
  updateUser,
  type UserWithStats,
} from "../services/user-service";
import { issueToken, revokeToken, tokenInfoFor } from "../services/token-service";
import { adminOverview, recentAudioGlobal } from "../services/stats-service";
import { deleteAudio, listAudios } from "../services/audio-service";
import { queryApiLogs } from "../services/api-log-service";
import { applySettingsPatch, getSettings } from "../services/settings-service";
import type { UserAdminDTO } from "../../shared/types";

/** Admin operations for the SPA dashboard. All require an admin session. */
export const clientAdmin = new Hono<SessionEnv>();

clientAdmin.use("*", requireSession, requireAdmin);

const MB = 1024 * 1024;

clientAdmin.get("/overview", (c) =>
  c.json({ success: true, data: { overview: adminOverview(), recent_audio: recentAudioGlobal(8) } }),
);

/* ---------------- users ---------------- */

clientAdmin.get("/users", (c) => {
  const q = c.req.query();
  const page = Math.max(1, Number(q.page ?? 1) || 1);
  const perPage = Math.min(100, Math.max(1, Number(q.per_page ?? 20) || 20));
  const { rows, total } = listUsers({ search: q.search?.trim() || undefined, page, perPage });
  return c.json({
    success: true,
    data: rows.map(toUserAdminDTOWithToken),
    meta: { page, per_page: perPage, total, total_pages: Math.max(1, Math.ceil(total / perPage)) },
  });
});

clientAdmin.post("/users", async (c) => {
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const input = parseOrThrow(createUserSchema, body);
  const { user, rawToken } = await createUser({
    name: input.name,
    email: input.email,
    password: input.password,
    storageLimitBytes: input.storage_limit_mb ? input.storage_limit_mb * MB : null,
    status: input.status,
    createdBy: c.get("user").id,
  });
  return c.json(
    {
      success: true,
      // Full plaintext token — the ONLY time it is ever returned.
      data: { user: getUserAdminDTO(user.id), token: rawToken },
    },
    201,
  );
});

clientAdmin.get("/users/:id", (c) => c.json({ success: true, data: getUserAdminDTO(requireUserId(c)) }));

clientAdmin.patch("/users/:id", async (c) => {
  const id = requireUserId(c);
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const patch = parseOrThrow(updateUserSchema, body);
  const row = updateUser(id, {
    name: patch.name,
    email: patch.email,
    status: patch.status,
    storageLimitBytes:
      patch.storage_limit_mb === undefined
        ? undefined
        : patch.storage_limit_mb === null
          ? null
          : patch.storage_limit_mb * MB,
  });
  return c.json({ success: true, data: getUserAdminDTO(row.id) });
});

clientAdmin.post("/users/:id/reset-password", async (c) => {
  const id = requireUserId(c);
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const { password } = parseOrThrow(resetPasswordSchema, body);
  await resetPassword(id, password);
  return c.json({ success: true, data: { reset: true } });
});

clientAdmin.post("/users/:id/token/regenerate", (c) => {
  const id = requireUserId(c);
  getUserOrThrow(id);
  const { raw } = issueToken(id, c.get("user").id);
  return c.json({ success: true, data: { token: raw } });
});

clientAdmin.post("/users/:id/token/revoke", (c) => {
  const id = requireUserId(c);
  getUserOrThrow(id);
  return c.json({ success: true, data: { revoked: revokeToken(id) } });
});

clientAdmin.delete("/users/:id", async (c) => {
  const id = requireUserId(c);
  if (id === c.get("user").id) throw badRequest("You cannot delete your own administrator account.");
  await deleteUser(id);
  return c.json({ success: true, data: { deleted: true, id } });
});

/* ---------------- audio (all tenants) ---------------- */

clientAdmin.get("/audio", (c) => {
  const q = parseOrThrow(adminAudioQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { user_id, page, per_page, ...filters } = q;
  const { dtos, meta } = listAudios(user_id ?? "all", { ...filters, page, perPage: per_page });
  return c.json({ success: true, data: dtos, meta });
});

clientAdmin.delete("/audio/:id", async (c) => {
  const id = normalizeId(c.req.param("id"));
  if (!id) throw notFound(`Audio "${c.req.param("id")}" was not found.`);
  await deleteAudio(id);
  return c.json({ success: true, data: { deleted: true, id } });
});

/* ---------------- api logs + settings ---------------- */

clientAdmin.get("/api-logs", (c) => {
  const q = parseOrThrow(apiLogQuerySchema, Object.fromEntries(new URL(c.req.url).searchParams));
  const { rows, meta } = queryApiLogs({ ...q, perPage: q.per_page });
  return c.json({ success: true, data: rows, meta });
});

clientAdmin.get("/settings", (c) => c.json({ success: true, data: getSettings() }));

clientAdmin.patch("/settings", async (c) => {
  const body: unknown = await c.req.json().catch(() => {
    throw badRequest("Body must be valid JSON.");
  });
  const patch = parseOrThrow(settingsPatchSchema, body);
  try {
    return c.json({ success: true, data: applySettingsPatch(patch) });
  } catch (err) {
    throw badRequest(err instanceof Error ? err.message : "Invalid settings payload.");
  }
});

function requireUserId(c: Context<SessionEnv, string>): number {
  const raw = Number(c.req.param("id"));
  if (!Number.isInteger(raw) || raw <= 0) throw notFound("User not found.");
  return raw;
}

function toUserAdminDTOWithToken(row: UserWithStats): UserAdminDTO {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    storage_limit_bytes: row.storageLimitBytes,
    storage_used_bytes: row.storage_used_bytes,
    audio_count: row.audio_count,
    last_login_at: row.lastLoginAt,
    last_api_request_at: row.last_api_request_at,
    token: tokenInfoFor(row.id),
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}
