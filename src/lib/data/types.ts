export type ServiceName =
  "NASA POWER" | "MODIS (ORNL DAAC)" | "Configuration" | "Locations" | "Snapshot";

export type ServiceErrorCode =
  | "network"
  | "timeout"
  | "http"
  | "not_found"
  | "invalid_json"
  | "invalid_response"
  | "unknown_unit"
  | "missing_metadata";

export interface ServiceError {
  service: ServiceName;
  code: ServiceErrorCode;
  message: string;
  status?: number;
  point_id?: string;
  url?: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: ServiceError };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail<T = never>(error: ServiceError): Result<T> {
  return { ok: false, error };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
