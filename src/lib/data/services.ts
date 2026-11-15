import type { Point } from "@/lib/contract";

import {
  bandsUrl,
  datesUrl,
  MODIS_TIMEOUT_MS,
  parseBands,
  parseDates,
  parseSubset,
  subsetUrl,
  type BandMeta,
  type ModisDate,
  type SubsetRecord,
} from "./modis";
import {
  buildPowerUrl,
  parsePowerResponse,
  POWER_TIMEOUT_MS,
  type PowerPointResult,
} from "./power";
import { fail, ok, type Result } from "./types";
import { fetchUpstreamJson } from "./upstream";

export type PointLocation = Pick<Point, "id" | "latitude" | "longitude">;

/** The four upstream operations the bundle loader needs. */
export interface DataServices {
  power(point: PointLocation, end: string): Promise<Result<PowerPointResult>>;
  modisDates(point: PointLocation): Promise<Result<ModisDate[]>>;
  modisBands(): Promise<Result<BandMeta>>;
  modisChunk(
    point: PointLocation,
    startDate: string,
    endDate: string,
  ): Promise<Result<SubsetRecord[]>>;
}

export async function fetchPowerPoint(
  point: PointLocation,
  end: string,
): Promise<Result<PowerPointResult>> {
  const url = buildPowerUrl(point.latitude, point.longitude, end);
  const response = await fetchUpstreamJson(url, {
    service: "NASA POWER",
    timeoutMs: POWER_TIMEOUT_MS,
    pointId: point.id,
  });
  if (!response.ok) return fail(response.error);
  return parsePowerResponse(response.value, point.id, url, new Date().toISOString());
}

export async function fetchModisDates(point: PointLocation): Promise<Result<ModisDate[]>> {
  const url = datesUrl(point.latitude, point.longitude);
  const response = await fetchUpstreamJson(url, {
    service: "MODIS (ORNL DAAC)",
    timeoutMs: MODIS_TIMEOUT_MS,
    pointId: point.id,
  });
  return response.ok ? parseDates(response.value, point.id) : fail(response.error);
}

/** Band metadata; when the list cannot be fetched, documented values are used and flagged. */
export async function fetchModisBands(): Promise<Result<BandMeta>> {
  const response = await fetchUpstreamJson(bandsUrl(), {
    service: "MODIS (ORNL DAAC)",
    timeoutMs: MODIS_TIMEOUT_MS,
  });
  return ok(parseBands(response.ok ? response.value : null));
}

export async function fetchModisChunk(
  point: PointLocation,
  startDate: string,
  endDate: string,
): Promise<Result<SubsetRecord[]>> {
  const url = subsetUrl(point.latitude, point.longitude, startDate, endDate);
  const response = await fetchUpstreamJson(url, {
    service: "MODIS (ORNL DAAC)",
    timeoutMs: MODIS_TIMEOUT_MS,
    pointId: point.id,
  });
  return response.ok ? parseSubset(response.value, point.id, url) : fail(response.error);
}

export const directServices: DataServices = {
  power: fetchPowerPoint,
  modisDates: fetchModisDates,
  modisBands: fetchModisBands,
  modisChunk: fetchModisChunk,
};
