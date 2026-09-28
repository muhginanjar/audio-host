import type { ErrorCode } from "../../shared/error-codes";
import { ERROR_STATUS } from "../../shared/error-codes";
import type { ApiError } from "../../shared/types";

export class AppError extends Error {
  code: ErrorCode;
  status: number;
  details?: unknown;
  headers?: Record<string, string>;

  constructor(code: ErrorCode, message: string, opts?: { details?: unknown; headers?: Record<string, string>; status?: number }) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.status = opts?.status ?? ERROR_STATUS[code];
    this.details = opts?.details;
    this.headers = opts?.headers;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError("VALIDATION_ERROR", message, { details });
export const unauthorized = (message = "Authentication required.") =>
  new AppError("UNAUTHORIZED", message);
export const forbidden = (message = "You do not have access to this resource.") =>
  new AppError("FORBIDDEN", message);
export const notFound = (message = "Resource not found.") =>
  new AppError("NOT_FOUND", message);
export const payloadTooLarge = (message: string) =>
  new AppError("PAYLOAD_TOO_LARGE", message);
export const invalidFileType = (message = "The uploaded file type is not supported.") =>
  new AppError("INVALID_FILE_TYPE", message);
export const invalidFile = (message = "The audio file could not be parsed and may be corrupt.") =>
  new AppError("INVALID_FILE", message);
export const storageLimitExceeded = (message: string) =>
  new AppError("STORAGE_LIMIT_EXCEEDED", message);
export const noFileProvided = (message = "No file was provided.") =>
  new AppError("NO_FILE_PROVIDED", message);

export function apiError(err: AppError): ApiError {
  const out: ApiError = { code: err.code, message: err.message };
  if (err.details !== undefined) out.details = err.details;
  return out;
}
