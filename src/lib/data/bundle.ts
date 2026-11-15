import type {
  BundleData,
  ClimateFile,
  ConfigFile,
  EvidenceGrade,
  Manifest,
  NdviFile,
  NdviPointStatus,
  Point,
  PointsFile,
} from "@/lib/contract";

import type { BandMeta } from "./modis";
import { MODIS_PRODUCT, MODIS_VERSION } from "./modis";
import {
  CANONICAL_UNITS,
  METEOROLOGY_VARIABLES,
  POWER_VARIABLES,
  variableLabel,
  variableSource,
  type PowerPointResult,
} from "./power";
import { isRecord } from "./types";

export const CELL_INFERENCE =
  "Cell groups are inferred from identical returned values: points whose series are identical for every variable in the group share a cell. This assumes NASA POWER does not interpolate between cells; no extra requests were made to test it.";

export interface NdviPointResult {
  file: NdviFile | null;
  status: NdviPointStatus;
}

export interface AssembleInput {
  points: PointsFile;
  config: ConfigFile;
  power: Record<string, PowerPointResult>;
  ndvi: Record<string, NdviPointResult>;
  bandMeta: BandMeta | null;
  retrievedAt: string;
  warnings?: string[];
}

/** JSON with object keys sorted at every level, so equal content always gives equal text. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value))
    return `{${Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  return JSON.stringify(value ?? null);
}

export async function sha256Hex(text: string): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return null;
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Group points whose series are identical for every listed variable. */
export function computeCellGroups(climate: Record<string, ClimateFile>, pointIds: string[], variables: readonly string[]) {
  const signatures = new Map<string, string[]>();
  for (const id of pointIds) {
    const file = climate[id];
    if (!file) continue;
    const signature = canonicalJson([
      file.dates,
      variables.map((name) => file.variables[name as keyof ClimateFile["variables"]]?.values ?? null),
    ]);
    signatures.set(signature, [...(signatures.get(signature) ?? []), id]);
  }
  const cells = [...signatures.values()].map((ids, index) => ({ cell_id: `cell_${index + 1}`, point_ids: ids }));
  const pointToCell = Object.fromEntries(cells.flatMap((cell) => cell.point_ids.map((id) => [id, cell.cell_id])));
  return { cells, point_to_cell: pointToCell as Record<string, string> };
}

function isParam(value: Record<string, unknown>) {
  return "evidence_grade" in value && "value" in value && "min" in value && "max" in value;
}

export function countParameterGrades(config: ConfigFile) {
  const counts: Record<EvidenceGrade, number> = { verified: 0, provisional: 0, unresolved: 0 };
  const walk = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(walk);
    else if (isRecord(value)) {
      if (isParam(value)) {
        const grade = value["evidence_grade"];
        if (grade === "verified" || grade === "provisional" || grade === "unresolved") counts[grade] += 1;
        return;
      }
      Object.values(value).forEach(walk);
    }
  };
  walk(config.crops);
  walk(config.rotation_rules);
  return counts;
}

/** Assemble the BundleData shape defined in src/lib/contract.ts from retrieved results. */
export async function assembleBundle(input: AssembleInput): Promise<BundleData> {
  const pointIds = input.points.points.map((point) => point.id);
  const climate: Record<string, ClimateFile> = {};
  for (const id of pointIds) {
    const result = input.power[id];
    if (result) climate[id] = result.climate;
  }
  const meteorology = computeCellGroups(climate, pointIds, METEOROLOGY_VARIABLES);
  const solar = computeCellGroups(climate, pointIds, ["ALLSKY_SFC_SW_DWN"]);
  const warnings = [...(input.warnings ?? [])];
  const points: Point[] = input.points.points.map((point) => {
    const result = input.power[point.id];
    return {
      ...point,
      elevation_m: result ? result.elevation_m : null,
      cell_id: meteorology.point_to_cell[point.id] ?? "unassigned",
    };
  });
  for (const id of pointIds) {
    const result = input.power[id];
    if (result) warnings.push(...result.warnings);
    else warnings.push(`Climate for ${id} is not available; this location has no climate series.`);
  }
  const ndvi: Record<string, NdviFile> = {};
  const statusByPoint: Record<string, NdviPointStatus> = {};
  const compositeCounts: Record<string, { total: number; valid: number }> = {};
  for (const id of pointIds) {
    const entry = input.ndvi[id];
    statusByPoint[id] = entry?.status ?? { status: "pending", detail: "Vegetation record not yet requested." };
    if (entry?.file) {
      ndvi[id] = entry.file;
      compositeCounts[id] = {
        total: entry.file.composite_dates.length,
        valid: entry.file.quality_ok.filter(Boolean).length,
      };
    }
  }
  const ends = Object.values(climate).map((file) => file.end).sort();
  const starts = Object.values(climate).map((file) => file.start).sort();
  const endDate = ends.at(-1) ?? "";

  const pointsFile: PointsFile = { bundle_version: "", points };
  const hash = await sha256Hex(canonicalJson({ points: pointsFile, climate, ndvi, config: input.config }));
  const bundleVersion = hash ?? "not computed";
  if (!hash) warnings.push("Bundle version not computed: the Web Crypto API is not available in this browser.");
  pointsFile.bundle_version = bundleVersion;

  const missingCounts: Record<string, Record<string, number>> = {};
  const rowCounts: Record<string, number> = {};
  const requests: NonNullable<Manifest["data"]["power"]["requests"]> = {};
  for (const [id, result] of Object.entries(input.power)) {
    missingCounts[id] = { ...result.missing_counts };
    rowCounts[id] = result.climate.dates.length;
    requests[id] = {
      url: result.request_url,
      retrieved_at_utc: result.retrieved_at_utc,
      fill_value: result.fill_value,
      served_units: Object.fromEntries(Object.entries(result.served).map(([key, item]) => [key, item.unit])),
      conversions: result.conversions.map((item) => ({ ...item })),
    };
  }

  const meta = input.bandMeta;
  const manifest: Manifest = {
    bundle_version: bundleVersion,
    built_at_utc: input.retrievedAt,
    data: {
      power: {
        community: "AG",
        start: starts[0] ?? "",
        end: endDate,
        variables: Object.fromEntries(
          POWER_VARIABLES.map((name) => [
            name,
            { unit: CANONICAL_UNITS[name], label: variableLabel(name), source: variableSource(name) },
          ]),
        ),
        row_counts: rowCounts,
        missing_counts: missingCounts,
        source_files: [],
        requests,
      },
      ndvi: {
        product: MODIS_PRODUCT,
        version: MODIS_VERSION,
        scale_applied: meta?.scale_factor ?? 0,
        label: "observed",
        source_by_point: Object.fromEntries(
          pointIds.map((id) => [id, `ORNL DAAC MODIS web service: ${statusByPoint[id]?.detail ?? "not requested"}`]),
        ),
        composite_counts: compositeCounts,
        source_files: [],
        ...(meta
          ? {
              metadata_source: {
                scale_factor: meta.source.scale_factor,
                fill_value: meta.source.fill_value,
                valid_range: meta.source.valid_range,
                reliability_fill: meta.source.reliability_fill,
                acceptable_reliability: meta.source.acceptable_reliability,
              },
            }
          : {}),
        status_by_point: statusByPoint,
      },
      end_date: endDate,
      time_standard: "UTC",
      cell_groups: { ...meteorology, inference: CELL_INFERENCE, solar },
    },
    config: {
      schema_version: input.config.schema_version,
      source_files: [],
      parameter_counts: countParameterGrades(input.config),
      assumption_count: input.config.assumptions.length,
      source_count: input.config.sources.length,
    },
    files: [],
    warnings,
  };
  return { points: pointsFile, climate, ndvi, config: input.config, manifest };
}
