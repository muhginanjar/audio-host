import type { ErrorCode } from "./error-codes";

export type Visibility = "public" | "private";
export type UserRole = "admin" | "user";
export type UserStatus = "active" | "disabled";

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: unknown;
}

export type ApiResult<T> =
  | { success: true; data: T; meta?: PaginationMeta }
  | { success: false; error: ApiError };

export interface PaginationMeta {
  page: number;
  per_page: number;
  total: number;
  total_pages: number;
}

/** Audio object as exposed by REST + client APIs. */
export interface AudioDTO {
  id: string;
  filename: string; // original filename
  title: string;
  description: string;
  mime_type: string;
  extension: string;
  size: number; // bytes
  duration: number | null; // seconds
  bitrate: number | null; // bits/s
  sample_rate: number | null; // Hz
  channels: number | null;
  format: string | null; // container
  codec: string | null;
  artist: string | null;
  album: string | null;
  visibility: Visibility;
  status: "pending" | "ready" | "error";
  url: string;
  embed_url: string;
  download_url: string;
  play_count: number;
  created_at: string;
  updated_at: string;
  owner?: { id: number; name: string; email?: string }; // admin listings include email; public feed: id + name only
  folder?: { id: string; name: string } | null;
}

export interface FolderDTO {
  id: string;
  name: string;
  visibility: Visibility;
  show_on_homepage: boolean;
  track_count: number;
  public_track_count: number;
  total_duration: number;
  total_plays: number;
  owner?: { id: number; name: string };
  created_at: string;
  updated_at: string;
}

export interface FolderDetailDTO {
  folder: FolderDTO;
  tracks: AudioDTO[];
  meta: PaginationMeta;
}

export interface StorageUsage {
  limit_bytes: number;
  used_bytes: number;
  remaining_bytes: number;
  percent_used: number;
}

export interface TokenInfo {
  has_token: boolean;
  prefix: string | null;
  suffix: string | null;
  masked: string | null;
  created_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

export interface DashboardStats {
  audio_count: number;
  storage_used_bytes: number;
  storage: StorageUsage;
  uploads_today: number;
  plays_today: number;
  api_requests_today: number;
  /** Newest PUBLIC tracks across every account (the "/" playlist feed). */
  recent_audio: AudioDTO[];
  /** Newest uploads of the requesting user (their own dashboard). */
  my_recent_audio: AudioDTO[];
  recent_activity: ActivityItem[];
}

export interface MeDTO {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  created_at: string;
  last_login_at: string | null;
  audio_count: number;
  storage: StorageUsage;
  token: TokenInfo;
}

export interface UserAdminDTO {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  storage_limit_bytes: number | null;
  storage_used_bytes: number;
  audio_count: number;
  last_login_at: string | null;
  last_api_request_at: string | null;
  token: TokenInfo;
  created_at: string;
  updated_at: string;
}

export interface DashboardStats {
  audio_count: number;
  storage_used_bytes: number;
  storage: StorageUsage;
  uploads_today: number;
  plays_today: number;
  api_requests_today: number;
  recent_audio: AudioDTO[];
  recent_activity: ActivityItem[];
}

export interface ActivityItem {
  kind: "upload" | "api" | "play" | "login";
  label: string;
  detail: string | null;
  at: string;
}

export interface AdminOverview {
  total_users: number;
  total_active_users: number;
  total_audio: number;
  total_storage_bytes: number;
  uploads_today: number;
  api_requests_today: number;
  api_errors_today: number;
  top_users_by_storage: { id: number; name: string; email: string; audio_count: number; storage_used_bytes: number }[];
}

export interface ApiLogDTO {
  id: number;
  user_id: number | null;
  user_name: string | null;
  api_token_id: string | null;
  method: string;
  path: string;
  status_code: number;
  ip_address: string;
  user_agent: string;
  response_time_ms: number;
  created_at: string;
}

export interface AudioStatsDTO {
  play_count: number;
  plays_today: number;
  plays_7d: number;
  last_played_at: string | null;
  unique_visitors_7d: number;
}

export interface AppSettings {
  api_rate_limit_per_minute: number;
  upload_rate_limit_per_minute: number;
  max_upload_size_mb: number;
  default_user_storage_limit_mb: number;
  cors_allowed_origins: string;
  app_url: string;
}
