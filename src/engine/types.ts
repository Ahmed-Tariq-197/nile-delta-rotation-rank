/** Public types for the rotation-planning engine. Contract v1: snake_case keys, explicit units, finite numbers or null. */

export const CROP_IDS = ['wheat', 'berseem', 'cotton', 'maize', 'rice'] as const;
export type CropId = (typeof CROP_IDS)[number];

export const SEASONS = ['winter', 'summer'] as const;
export type Season = (typeof SEASONS)[number];

export const LABELS = ['observed', 'modeled', 'assumed'] as const;
export type Label = (typeof LABELS)[number];

export const EVIDENCE_GRADES = ['verified', 'provisional', 'unresolved'] as const;
export type EvidenceGrade = (typeof EVIDENCE_GRADES)[number];

export type ErrorCode = 'UNKNOWN_POINT' | 'INVALID_REQUEST' | 'NO_FEASIBLE_PLAN' | 'DATA_GAP';

export class EngineError extends Error {
  readonly code: ErrorCode;
  constructor(code: ErrorCode, message: string) {
    super(message);
    this.name = 'EngineError';
    this.code = code;
    Object.setPrototypeOf(this, EngineError.prototype);
  }
}

/* ----------------------------- Data bundle ----------------------------- */

export interface BundlePoint {
  id: string;
  name: string;
  area: string;
  latitude: number;
  longitude: number;
  elevation_m: number | null;
  cell_id: string;
  location_note: string;
}

export interface PointsFile {
  bundle_version: string;
  points: BundlePoint[];
}

export interface ClimateVariable {
  unit: string;
  label: Label;
  source: string;
  values: Array<number | null>;
}

export interface ClimateFile {
  point_id: string;
  time_standard: string;
  start: string;
  end: string;
  dates: string[];
  variables: Record<string, ClimateVariable>;
}

/**
 * A configuration parameter as written by the agronomy config (schema v1.1):
 * value, min, max, unit, source, locator, evidence_grade, confidence, notes.
 * The fields label and source_id are accepted as aliases (label, source).
 */
export interface ConfigParam {
  value: number | string | null;
  min?: number | null;
  max?: number | null;
  unit?: string;
  label?: Label;
  source?: string;
  source_id?: string;
  locator?: string;
  evidence_grade?: EvidenceGrade;
  confidence?: string;
  notes?: string;
}

export interface ConfigSource {
  id: string;
  citation: string;
  url_or_doi: string;
  date_opened: string;
  access_status: string;
}

export interface ConfigFile {
  schema_version: string | number;
  crops: Record<string, unknown>;
  seasons?: unknown[];
  /** Contract name for the rule list; the agronomy config calls it "rules". Both are accepted. */
  rotation_rules?: unknown[];
  rules?: unknown[];
  assumptions?: unknown[];
  sources?: ConfigSource[];
  soil_health?: unknown;
  climate_risk?: unknown;
}

export interface ManifestFile {
  bundle_version: string;
  built_at_utc?: string;
  data?: { end_date?: string; [key: string]: unknown };
  [key: string]: unknown;
}

/** A bundle already loaded into memory (fetched in a browser or read in Node). */
export interface EngineBundle {
  points: PointsFile;
  climate: Record<string, ClimateFile>;
  config: ConfigFile;
  manifest?: ManifestFile;
}

/* ------------------------------ Request ------------------------------- */

export interface EngineRequest {
  point_id: string;
  horizon_years: 3;
  priorities: { water: number; soil_health: number; climate_risk: number };
  soil: { salinity_ec_dsm: number | null };
  constraints: {
    allowed_crops: CropId[] | null;
    max_share_by_crop: Partial<Record<CropId, number>> | null;
    seasonal_water_cap_mm: number | null;
  };
}

export interface EngineOptions {
  /**
   * Replaces config values for sensitivity analysis only. Keys are dotted config paths
   * (for example "crops.rice.extra_water_mm" or "rules.nc_berseem_any.effect"). The special key
   * "point.elevation_m" supplies an elevation when the point has none.
   */
  paramOverrides?: Record<string, number>;
}

/* ----------------------------- Response ------------------------------- */

export interface Slot {
  year: 1 | 2 | 3;
  season: Season;
  crop_id: CropId;
}

export interface SlotDetail extends Slot {
  water_demand_mm: number;
  n_balance_kg_ha: number | null;
  relative_yield_reduction_pct: number | null;
}

export interface Driver {
  label: string;
  share: number;
}

export interface IndicatorValue {
  value: number;
  unit: string;
  normalized: number;
  uncertainty: { low: number; high: number } | null;
  weakest_grade: EvidenceGrade;
  drivers: Driver[];
}

export interface ProvenanceEntry {
  kind: 'data' | 'config';
  ref: string;
  label: Label;
  evidence_grade?: EvidenceGrade;
  source_id?: string;
}

export interface Plan {
  id: string;
  slots: Slot[];
  slot_details: SlotDetail[];
  indicators: {
    water_demand_mm_total: IndicatorValue;
    soil_health_index: IndicatorValue;
    climate_risk_index: IndicatorValue;
  };
  score: number;
  rank: number;
  pareto: boolean;
  evidence: { weakest_grade: EvidenceGrade; provisional_count: number; unresolved_count: number };
  provenance: ProvenanceEntry[];
}

export interface EngineResponse {
  engine_version: string;
  bundle_version: string;
  data_end_date: string;
  request: EngineRequest;
  plans: Plan[];
  pareto_front_ids: string[];
  top_ids: string[];
  warnings: string[];
  limits: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}
