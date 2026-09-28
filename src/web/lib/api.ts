import type {
  AdminOverview,
  ApiLogDTO,
  AppSettings,
  AudioDTO,
  AudioStatsDTO,
  DashboardStats,
  MeDTO,
  PaginationMeta,
  UserAdminDTO,
} from "@shared/types";

export class ApiClientError extends Error {
  code: string;
  status: number;
  constructor(message: string, code: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope<T> = { success: true; data: T; meta?: PaginationMeta };

async function call<T>(method: string, url: string, body?: unknown): Promise<Envelope<T>> {
  const res = await fetch(url, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let payload: Envelope<T> | { success: false; error: { code: string; message: string } };
  try {
    payload = await res.json();
  } catch {
    throw new ApiClientError(`Request failed (${res.status})`, "INTERNAL_ERROR", res.status);
  }
  if (!payload.success) throw new ApiClientError(payload.error.message, payload.error.code, res.status);
  return payload;
}

const get = <T>(url: string) => call<T>("GET", url);
const post = <T>(url: string, body?: unknown) => call<T>("POST", url, body ?? {});
const patch = <T>(url: string, body: unknown) => call<T>("PATCH", url, body);
const del = <T>(url: string) => call<T>("DELETE", url);

function qs(params: object): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

export interface AudioListParams {
  page?: number;
  per_page?: number;
  search?: string;
  format?: string;
  visibility?: string;
  sort?: string;
  order?: "asc" | "desc";
  date_from?: string;
  date_to?: string;
  user_id?: number;
}

export type AudioWithStats = AudioDTO & { stats: AudioStatsDTO };

export const api = {
  login: (email: string, password: string) => post<MeDTO>("/api/client/auth/login", { email, password }),
  logout: () => post<{ loggedOut: boolean }>("/api/client/auth/logout"),

  me: () => get<MeDTO>("/api/client/me"),
  stats: () => get<DashboardStats>("/api/client/stats"),
  changePassword: (current_password: string, new_password: string) =>
    post<{ logout_required: boolean }>("/api/client/profile/password", { current_password, new_password }),
  regenerateOwnToken: () => post<{ token: string }>("/api/client/profile/token/regenerate"),

  audioList: (p: AudioListParams = {}) => get<AudioDTO[]>(`/api/client/audio${qs(p)}`),
  feedList: (p: AudioListParams = {}) => get<AudioDTO[]>(`/api/public/feed${qs(p)}`),
  feedStats: () => get<{ total_tracks: number; total_plays: number; total_size_bytes: number; contributors: number; tracks_today: number }>("/api/public/feed/stats"),
  audioGet: (id: string) => get<AudioWithStats>(`/api/client/audio/${id}`),
  audioPatch: (id: string, body: { title?: string; description?: string; visibility?: string }) =>
    patch<AudioDTO>(`/api/client/audio/${id}`, body),
  audioDelete: (id: string) => del<{ deleted: boolean; id: string }>(`/api/client/audio/${id}`),

  admin: {
    overview: () => get<{ overview: AdminOverview; recent_audio: AudioDTO[] }>("/api/client/admin/overview"),
    users: (p: { search?: string; page?: number; per_page?: number } = {}) =>
      get<UserAdminDTO[]>(`/api/client/admin/users${qs(p)}`),
    userCreate: (body: { name: string; email: string; password: string; storage_limit_mb?: number; status?: string }) =>
      post<{ user: UserAdminDTO; token: string }>("/api/client/admin/users", body),
    userGet: (id: number) => get<UserAdminDTO>(`/api/client/admin/users/${id}`),
    userPatch: (id: number, body: Record<string, unknown>) => patch<UserAdminDTO>(`/api/client/admin/users/${id}`, body),
    userDelete: (id: number) => del<{ deleted: boolean }>(`/api/client/admin/users/${id}`),
    userResetPassword: (id: number, password: string) =>
      post<{ reset: boolean }>(`/api/client/admin/users/${id}/reset-password`, { password }),
    userTokenRegenerate: (id: number) => post<{ token: string }>(`/api/client/admin/users/${id}/token/regenerate`),
    userTokenRevoke: (id: number) => post<{ revoked: boolean }>(`/api/client/admin/users/${id}/token/revoke`),
    audioList: (p: AudioListParams = {}) => get<AudioDTO[]>(`/api/client/admin/audio${qs(p)}`),
    audioDelete: (id: string) => del<{ deleted: boolean }>(`/api/client/admin/audio/${id}`),
    logs: (
      p: { user_id?: number; status?: number; search?: string; date_from?: string; date_to?: string; page?: number; per_page?: number } = {},
    ) => get<ApiLogDTO[]>(`/api/client/admin/api-logs${qs(p)}`),
    settings: () => get<AppSettings>("/api/client/admin/settings"),
    settingsPatch: (body: Record<string, string | number>) => patch<AppSettings>("/api/client/admin/settings", body),
  },
};

/** Multipart upload with real progress events (fetch can't report upload %). */
export function uploadAudio(form: FormData, onProgress: (percent: number) => void): Promise<AudioDTO> {
  const { promise, resolve, reject } = Promise.withResolvers<AudioDTO>();
  const xhr = new XMLHttpRequest();
  xhr.open("POST", "/api/client/audio");
  xhr.withCredentials = true;
  xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
  xhr.onload = () => {
    let payload: { success: boolean; data?: AudioDTO; error?: { message: string; code: string } };
    try {
      payload = JSON.parse(xhr.responseText);
    } catch {
      return reject(new ApiClientError(`Upload failed (${xhr.status})`, "INTERNAL_ERROR", xhr.status));
    }
    if (payload.success && payload.data) resolve(payload.data);
    else reject(new ApiClientError(payload.error?.message ?? "Upload failed.", payload.error?.code ?? "VALIDATION_ERROR", xhr.status));
  };
  xhr.onerror = () => reject(new ApiClientError("Network error during upload", "INTERNAL_ERROR", 0));
  xhr.send(form);
  return promise;
}
