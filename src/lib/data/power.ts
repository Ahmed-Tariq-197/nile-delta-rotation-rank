import type { ClimateFile, ClimateVariable, Label } from "@/lib/contract";

import { fail, isRecord, ok, type Result, type ServiceError } from "./types";

export const POWER_ENDPOINT = "https://power.larc.nasa.gov/api/temporal/daily/point";
export const POWER_START = "20200101";
export const POWER_TIMEOUT_MS = 25_000;
export const POWER_VARIABLES = [
  "T2M",
  "T2M_MAX",
  "T2M_MIN",
  "PRECTOTCORR",
  "RH2M",
  "WS2M",
  "ALLSKY_SFC_SW_DWN",
  "GWETROOT",
] as const;
export type PowerVariable = (typeof POWER_VARIABLES)[number];
export const METEOROLOGY_VARIABLES = POWER_VARIABLES.filter((name) => name !== "ALLSKY_SFC_SW_DWN");

export const METEOROLOGY_SOURCE =
  "NASA POWER (MERRA-2 assimilation model; GEOS FP-IT near real time)";
export const SOLAR_SOURCE =
  "NASA POWER, satellite-derived (CERES SYN1deg; FLASHFlux near real time)";

export const CANONICAL_UNITS: Record<PowerVariable, string> = {
  T2M: "degrees C",
  T2M_MAX: "degrees C",
  T2M_MIN: "degrees C",
  PRECTOTCORR: "mm/day",
  RH2M: "percent",
  WS2M: "m/s",
  ALLSKY_SFC_SW_DWN: "MJ/m^2/day",
  GWETROOT: "dimensionless",
};

/** Served-unit spellings accepted as identical to the canonical unit (factor 1). */
const IDENTITY_UNITS: Record<Exclude<PowerVariable, "ALLSKY_SFC_SW_DWN">, string[]> = {
  T2M: ["c", "°c", "degrees c", "deg c", "degc"],
  T2M_MAX: ["c", "°c", "degrees c", "deg c", "degc"],
  T2M_MIN: ["c", "°c", "degrees c", "deg c", "degc"],
  PRECTOTCORR: ["mm/day", "mm day-1", "mm/d"],
  RH2M: ["%", "percent"],
  WS2M: ["m/s", "m s-1"],
  GWETROOT: ["1", "dimensionless", "fraction", "-", "0 to 1"],
};

function normalizeUnit(unit: string) {
  return unit.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Factor that converts a served solar unit to MJ/m^2/day, or null when the unit is not recognized. */
export function solarFactor(servedUnit: string): number | null {
  const unit = normalizeUnit(servedUnit).replace(/\s/g, "");
  if (unit === "mj/m^2/day" || unit === "mjm-2day-1") return 1;
  if (unit === "kw-hr/m^2/day" || unit === "kwh/m^2/day") return 3.6;
  if (unit === "wh/m^2") return 0.0036;
  if (unit === "w/m^2") return 0.0864;
  return null;
}

export function conversionFactor(variable: PowerVariable, servedUnit: string): number | null {
  if (variable === "ALLSKY_SFC_SW_DWN") return solarFactor(servedUnit);
  return IDENTITY_UNITS[variable].includes(normalizeUnit(servedUnit)) ? 1 : null;
}

export function variableLabel(_variable: PowerVariable): Label {
  return "modeled";
}

export function variableSource(variable: PowerVariable) {
  return variable === "ALLSKY_SFC_SW_DWN" ? SOLAR_SOURCE : METEOROLOGY_SOURCE;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** The request end date: the run date in UTC minus 10 days, as YYYYMMDD. */
export function powerEndDate(now: Date): string {
  const end = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  return `${end.getUTCFullYear()}${pad(end.getUTCMonth() + 1)}${pad(end.getUTCDate())}`;
}

export function compactToIso(value: string) {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

export function buildPowerUrl(latitude: number, longitude: number, end: string) {
  const query = new URLSearchParams({
    parameters: POWER_VARIABLES.join(","),
    community: "AG",
    longitude: String(longitude),
    latitude: String(latitude),
    start: POWER_START,
    end,
    format: "JSON",
    "time-standard": "UTC",
  });
  return `${POWER_ENDPOINT}?${query.toString().replace(/%2C/g, ",")}`;
}

export interface Conversion {
  variable: PowerVariable;
  served_unit: string;
  canonical_unit: string;
  factor: number;
}

export interface PowerPointResult {
  climate: ClimateFile;
  served: Record<PowerVariable, { unit: string; longname: string }>;
  conversions: Conversion[];
  fill_value: number;
  missing_counts: Record<PowerVariable, number>;
  range_violations: Record<PowerVariable, number>;
  elevation_m: number | null;
  request_url: string;
  retrieved_at_utc: string;
  warnings: string[];
}

function inRange(variable: PowerVariable, value: number) {
  if (variable === "RH2M") return value >= 0 && value <= 100;
  if (variable === "GWETROOT") return value >= 0 && value <= 1;
  if (variable === "PRECTOTCORR") return value >= 0;
  return true;
}

/** Parse and clean one NASA POWER daily point response. Never throws. */
export function parsePowerResponse(
  json: unknown,
  pointId: string,
  requestUrl: string,
  retrievedAt: string,
): Result<PowerPointResult> {
  const error = (code: ServiceError["code"], message: string) =>
    fail<PowerPointResult>({
      service: "NASA POWER",
      code,
      message,
      point_id: pointId,
      url: requestUrl,
    });
  if (!isRecord(json))
    return error("invalid_response", "The NASA POWER response is not a JSON object.");
  const properties = json["properties"];
  const parameterBlock = isRecord(properties) ? properties["parameter"] : undefined;
  if (!isRecord(parameterBlock))
    return error("invalid_response", "The NASA POWER response has no properties.parameter block.");
  const metadata = json["parameters"];
  if (!isRecord(metadata))
    return error(
      "missing_metadata",
      "The NASA POWER response does not state units for its parameters; units are reported as unknown.",
    );
  const header = json["header"];
  const fillRaw = isRecord(header) ? header["fill_value"] : undefined;
  if (typeof fillRaw !== "number" || !Number.isFinite(fillRaw))
    return error("missing_metadata", "The NASA POWER response header does not state a fill value.");
  const fill = fillRaw;

  const served = {} as PowerPointResult["served"];
  const conversions: Conversion[] = [];
  for (const variable of POWER_VARIABLES) {
    const meta = metadata[variable];
    const unit = isRecord(meta) && typeof meta["units"] === "string" ? meta["units"] : null;
    if (!unit)
      return error(
        "missing_metadata",
        `The unit of ${variable} is unknown: the response does not state it.`,
      );
    const factor = conversionFactor(variable, unit);
    if (factor === null)
      return error("unknown_unit", `${variable} was served in an unrecognized unit "${unit}".`);
    served[variable] = {
      unit,
      longname:
        isRecord(meta) && typeof meta["longname"] === "string" ? meta["longname"] : variable,
    };
    conversions.push({
      variable,
      served_unit: unit,
      canonical_unit: CANONICAL_UNITS[variable],
      factor,
    });
    if (!isRecord(parameterBlock[variable]))
      return error("invalid_response", `The response has no series for ${variable}.`);
  }

  const dateKeys = [
    ...new Set(
      POWER_VARIABLES.flatMap((variable) => Object.keys(parameterBlock[variable] as object)),
    ),
  ]
    .filter((key) => /^\d{8}$/.test(key))
    .sort();
  if (!dateKeys.length)
    return error("invalid_response", "The NASA POWER response contains no daily dates.");

  const missing = {} as PowerPointResult["missing_counts"];
  const violations = {} as PowerPointResult["range_violations"];
  const variables = {} as ClimateFile["variables"];
  const warnings: string[] = [];
  for (const conversion of conversions) {
    const { variable, factor } = conversion;
    const series = parameterBlock[variable] as Record<string, unknown>;
    let missingCount = 0;
    let violationCount = 0;
    const values = dateKeys.map((key) => {
      const raw = series[key];
      if (typeof raw !== "number" || !Number.isFinite(raw) || raw === fill) {
        missingCount += 1;
        return null;
      }
      const value = raw * factor;
      if (!inRange(variable, value)) {
        violationCount += 1;
        missingCount += 1;
        return null;
      }
      return value;
    });
    missing[variable] = missingCount;
    violations[variable] = violationCount;
    if (violationCount)
      warnings.push(
        `${pointId} ${variable}: ${violationCount} values outside the accepted range were set to null.`,
      );
    const entry: ClimateVariable = {
      unit: CANONICAL_UNITS[variable],
      label: variableLabel(variable),
      source: variableSource(variable),
      values,
    };
    variables[variable] = entry;
  }

  const geometry = json["geometry"];
  const coordinates = isRecord(geometry) ? geometry["coordinates"] : undefined;
  const elevationRaw = Array.isArray(coordinates) ? coordinates[2] : undefined;
  const elevation =
    typeof elevationRaw === "number" && Number.isFinite(elevationRaw) ? elevationRaw : null;
  if (elevation === null)
    warnings.push(`Elevation for ${pointId} was not returned by NASA POWER; elevation_m is null.`);

  const dates = dateKeys.map(compactToIso);
  return ok({
    climate: {
      point_id: pointId,
      time_standard: "UTC",
      start: dates[0] as string,
      end: dates[dates.length - 1] as string,
      dates,
      variables,
    },
    served,
    conversions,
    fill_value: fill,
    missing_counts: missing,
    range_violations: violations,
    elevation_m: elevation,
    request_url: requestUrl,
    retrieved_at_utc: retrievedAt,
    warnings,
  });
}
