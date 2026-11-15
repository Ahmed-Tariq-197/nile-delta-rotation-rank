import type { NdviFile } from "@/lib/contract";

import { fail, isRecord, ok, type Result, type ServiceError } from "./types";

export const MODIS_BASE = "https://modis.ornl.gov/rst/api/v1";
export const MODIS_PRODUCT = "MOD13Q1";
export const MODIS_VERSION = "061";
export const NDVI_BAND = "250m_16_days_NDVI";
export const RELIABILITY_BAND = "250m_16_days_pixel_reliability";
export const MODIS_CHUNK_SIZE = 10;
/**
 * Measured subset responses took 29 to 40 seconds, so the vegetation service uses a
 * longer per-request timeout than the climate service. See docs/DECISIONS.md.
 */
export const MODIS_TIMEOUT_MS = 60_000;
export const MODIS_FIRST_DATE = "2020-01-01";

export const DOCUMENTED_BAND_META = {
  scale_factor: 0.0001,
  fill_value: -3000,
  valid_min: -2000,
  valid_max: 10000,
  reliability_fill: -1,
  acceptable_reliability: [0],
} as const;

export type MetaSource = "served" | "documented";

export interface BandMeta {
  scale_factor: number;
  fill_value: number;
  valid_min: number;
  valid_max: number;
  reliability_fill: number;
  acceptable_reliability: number[];
  source: {
    scale_factor: MetaSource;
    fill_value: MetaSource;
    valid_range: MetaSource;
    reliability_fill: MetaSource;
    acceptable_reliability: "documented";
  };
}

export interface ModisDate {
  modis_date: string;
  calendar_date: string;
}

export interface SubsetRecord {
  band: string;
  calendar_date: string;
  modis_date: string;
  value: number | null;
}

function coordinateQuery(latitude: number, longitude: number) {
  return `latitude=${latitude}&longitude=${longitude}`;
}

export function datesUrl(latitude: number, longitude: number) {
  return `${MODIS_BASE}/${MODIS_PRODUCT}/dates?${coordinateQuery(latitude, longitude)}`;
}

export function bandsUrl() {
  return `${MODIS_BASE}/${MODIS_PRODUCT}/bands`;
}

export function subsetUrl(latitude: number, longitude: number, startDate: string, endDate: string) {
  return `${MODIS_BASE}/${MODIS_PRODUCT}/subset?${coordinateQuery(latitude, longitude)}&startDate=${startDate}&endDate=${endDate}&kmAboveBelow=0&kmLeftRight=0`;
}

function modisError(code: ServiceError["code"], message: string, pointId?: string, url?: string): ServiceError {
  return { service: "MODIS (ORNL DAAC)", code, message, ...(pointId ? { point_id: pointId } : {}), ...(url ? { url } : {}) };
}

export function parseDates(json: unknown, pointId?: string): Result<ModisDate[]> {
  const list = isRecord(json) ? json["dates"] : undefined;
  if (!Array.isArray(list))
    return fail(modisError("invalid_response", "The composite date list could not be read.", pointId));
  const dates = list.flatMap((item) =>
    isRecord(item) && typeof item["modis_date"] === "string" && typeof item["calendar_date"] === "string"
      ? [{ modis_date: item["modis_date"], calendar_date: item["calendar_date"] }]
      : [],
  );
  if (!dates.length) return fail(modisError("invalid_response", "The service listed no composite dates.", pointId));
  return ok(dates.sort((a, b) => a.calendar_date.localeCompare(b.calendar_date)));
}

function numberFrom(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRange(value: unknown): [number, number] | null {
  if (typeof value !== "string") return null;
  const match = value.match(/(-?\d+(?:\.\d+)?)\s*to\s*(-?\d+(?:\.\d+)?)/i);
  if (!match) return null;
  const low = Number(match[1]);
  const high = Number(match[2]);
  return Number.isFinite(low) && Number.isFinite(high) ? [low, high] : null;
}

/** Band metadata from the served list, falling back to documented values field by field. */
export function parseBands(json: unknown): BandMeta {
  const list = isRecord(json) && Array.isArray(json["bands"]) ? json["bands"] : [];
  const ndvi = list.find((item) => isRecord(item) && item["band"] === NDVI_BAND) as Record<string, unknown> | undefined;
  const reliability = list.find((item) => isRecord(item) && item["band"] === RELIABILITY_BAND) as
    | Record<string, unknown>
    | undefined;
  const scale = numberFrom(ndvi?.["scale_factor"]);
  const fillValue = numberFrom(ndvi?.["fill_value"]);
  const range = parseRange(ndvi?.["valid_range"]);
  const reliabilityFill = numberFrom(reliability?.["fill_value"]);
  return {
    scale_factor: scale ?? DOCUMENTED_BAND_META.scale_factor,
    fill_value: fillValue ?? DOCUMENTED_BAND_META.fill_value,
    valid_min: range?.[0] ?? DOCUMENTED_BAND_META.valid_min,
    valid_max: range?.[1] ?? DOCUMENTED_BAND_META.valid_max,
    reliability_fill: reliabilityFill ?? DOCUMENTED_BAND_META.reliability_fill,
    acceptable_reliability: [...DOCUMENTED_BAND_META.acceptable_reliability],
    source: {
      scale_factor: scale === null ? "documented" : "served",
      fill_value: fillValue === null ? "documented" : "served",
      valid_range: range === null ? "documented" : "served",
      reliability_fill: reliabilityFill === null ? "documented" : "served",
      acceptable_reliability: "documented",
    },
  };
}

/** Keep the NDVI and reliability records of one subset response. */
export function parseSubset(json: unknown, pointId?: string, url?: string): Result<SubsetRecord[]> {
  if (!isRecord(json)) return fail(modisError("invalid_response", "The subset response is not a JSON object.", pointId, url));
  const header = json["header"];
  if (typeof header === "string" && !header.includes(`/${MODIS_PRODUCT}/`))
    return fail(modisError("invalid_response", `The subset response is not for ${MODIS_PRODUCT}.`, pointId, url));
  const subset = json["subset"];
  if (!Array.isArray(subset))
    return fail(modisError("invalid_response", "The subset response has no subset records.", pointId, url));
  const records = subset.flatMap((item): SubsetRecord[] => {
    if (!isRecord(item)) return [];
    const band = item["band"];
    if (band !== NDVI_BAND && band !== RELIABILITY_BAND) return [];
    const calendar = item["calendar_date"];
    const modisDate = item["modis_date"];
    if (typeof calendar !== "string") return [];
    const data = item["data"];
    const first = Array.isArray(data) ? data[0] : data;
    return [{ band, calendar_date: calendar, modis_date: typeof modisDate === "string" ? modisDate : "", value: numberFrom(first) }];
  });
  return ok(records);
}

export function chunkDates<T>(dates: T[], size = MODIS_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < dates.length; index += size) chunks.push(dates.slice(index, index + size));
  return chunks;
}

/** Dates from 2020-01-01 whose composite window starts on or before the climate end date. */
export function selectDates(dates: ModisDate[], endIso: string) {
  return dates.filter((item) => item.calendar_date >= MODIS_FIRST_DATE && item.calendar_date <= endIso);
}

export function cleanNdvi(raw: number | null, meta: BandMeta): number | null {
  if (raw === null || !Number.isFinite(raw)) return null;
  if (raw === meta.fill_value || raw < meta.valid_min || raw > meta.valid_max) return null;
  return Math.round(raw * meta.scale_factor * 10000) / 10000;
}

export function reliabilityAcceptable(raw: number | null, meta: BandMeta) {
  return raw !== null && raw !== meta.reliability_fill && meta.acceptable_reliability.includes(raw);
}

export function buildNdviFile(pointId: string, dates: ModisDate[], records: SubsetRecord[], meta: BandMeta): NdviFile {
  const ndviByDate = new Map<string, number | null>();
  const reliabilityByDate = new Map<string, number | null>();
  for (const record of records) {
    (record.band === NDVI_BAND ? ndviByDate : reliabilityByDate).set(record.calendar_date, record.value);
  }
  const compositeDates = dates.map((item) => item.calendar_date);
  const ndvi = compositeDates.map((date) => cleanNdvi(ndviByDate.get(date) ?? null, meta));
  const quality = compositeDates.map(
    (date, index) => ndvi[index] !== null && reliabilityAcceptable(reliabilityByDate.get(date) ?? null, meta),
  );
  return {
    point_id: pointId,
    product: MODIS_PRODUCT,
    version: MODIS_VERSION,
    scale_applied: meta.scale_factor,
    composite_dates: compositeDates,
    ndvi,
    quality_ok: quality,
  };
}
