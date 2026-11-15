export type CropId = "wheat" | "berseem" | "cotton" | "maize" | "rice";
export type Season = "winter" | "summer";
export type Label = "observed" | "modeled" | "assumed";
export type EvidenceGrade = "verified" | "provisional" | "unresolved";
export type Confidence = "high" | "medium" | "low";
export type ParamUnit = "mm" | "days" | "m" | "degrees C" | "kg N per ha" | "dimensionless" | "dS per m" | "percent per dS per m" | "MM-DD" | "category";
export interface Point { id: string; name: string; area: string; latitude: number; longitude: number; elevation_m: number | null; cell_id: string; location_note: string; }
export interface PointsFile { bundle_version: string; points: Point[]; }
export interface ClimateVariable { unit: string; label: Label; source: string; values: (number | null)[]; }
export interface ClimateFile { point_id: string; time_standard: "UTC"; start: string; end: string; dates: string[]; variables: Record<"T2M" | "T2M_MAX" | "T2M_MIN" | "PRECTOTCORR" | "RH2M" | "WS2M" | "ALLSKY_SFC_SW_DWN" | "GWETROOT", ClimateVariable>; }
export interface NdviFile { point_id: string; product: string; version: string; scale_applied: number; composite_dates: string[]; ndvi: (number | null)[]; quality_ok: boolean[]; }
export interface Param { value: number | string | null; min: number | null; max: number | null; unit: ParamUnit; source: string; locator: string; evidence_grade: EvidenceGrade; confidence: Confidence; notes: string; }
export interface CropConfig { display_name: string; legume: boolean; season: Param; sowing_window: { start_md: Param; end_md: Param }; season_length_days: Param; stage_days: { ini: Param; dev: Param; mid: Param; late: Param }; kc: { ini: Param; mid: Param; end: Param }; root_depth_m: Param; depletion_fraction_p: Param; ky_total: Param; heat_stress: { threshold_c: Param; sensitive_stage: Param }; n_removal_kg_ha: Param; extra_water_mm: Param; salinity: { threshold_ds_m: Param; slope_pct_per_ds_m: Param }; }
export interface SeasonRecord { id: Season; months: number[]; description: string; source: string; locator: string; evidence_grade: EvidenceGrade; confidence: Confidence; }
export interface RuleRecord { id: string; type: "n_credit" | "previous_crop_effect" | "repetition_penalty" | "season_constraint"; from: CropId | "any"; to: CropId | "any"; effect: Param; direction: "positive" | "negative"; notes: string; }
export interface AssumptionRecord { path: string; decision_rule: "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7"; reason: string; planner_fallback: string; }
export interface SourceRecord { id: string; citation: string; url_or_doi: string; date_opened: string; access_status: "opened" | "not accessible"; }
export interface ConfigFile { schema_version: string; crops: Record<CropId, CropConfig>; seasons: SeasonRecord[]; rotation_rules: RuleRecord[]; assumptions: AssumptionRecord[]; sources: SourceRecord[]; }
export interface FileRecord { path: string; sha256: string; bytes: number; }
export interface PowerVariableInfo { unit: string; label: Label; source: string; }
export interface Manifest { bundle_version: string; built_at_utc: string; data: { power: { community: string; start: string; end: string; variables: Record<string, PowerVariableInfo>; row_counts: Record<string, number>; missing_counts: Record<string, Record<string, number>>; source_files: FileRecord[] }; ndvi: { product: string; version: string; scale_applied: number; label: Label; source_by_point: Record<string, string>; composite_counts: Record<string, { total: number; valid: number }>; source_files: FileRecord[] }; end_date: string; time_standard: "UTC"; cell_groups: { point_to_cell: Record<string, string>; cells: { cell_id: string; point_ids: string[] }[]; inference?: string } }; config: { schema_version: string; source_files: FileRecord[]; parameter_counts: { verified: number; provisional: number; unresolved: number }; assumption_count: number; source_count: number }; files: FileRecord[]; warnings: string[]; }
export interface Priorities { water: number; soil_health: number; climate_risk: number; }
export interface EngineRequest { point_id: string; horizon_years: 3; priorities: Priorities; soil: { salinity_ec_dsm: number | null }; constraints: { allowed_crops: CropId[] | null; max_share_by_crop: Partial<Record<CropId, number>> | null; seasonal_water_cap_mm: number | null }; }
export interface Slot { year: 1 | 2 | 3; season: Season; crop_id: CropId; }
export interface SlotDetail { year: 1 | 2 | 3; season: Season; crop_id: CropId; water_demand_mm: number; n_balance_kg_ha: number | null; relative_yield_reduction_pct: number | null; }
export interface Driver { label: string; share: number; }
export interface IndicatorValue { value: number; unit: string; normalized: number; uncertainty: { low: number; high: number } | null; weakest_grade: EvidenceGrade; drivers: Driver[]; }
export interface Indicators { water_demand_mm_total: IndicatorValue; soil_health_index: IndicatorValue; climate_risk_index: IndicatorValue; }
export interface ProvenanceEntry { kind: "data" | "config"; ref: string; label: Label; evidence_grade?: EvidenceGrade; source_id?: string; }
export interface Plan { id: string; slots: Slot[]; slot_details: SlotDetail[]; indicators: Indicators; score: number; rank: number; pareto: boolean; evidence: { weakest_grade: EvidenceGrade; provisional_count: number; unresolved_count: number }; provenance: ProvenanceEntry[]; }
export interface EngineResponse { engine_version: string; bundle_version: string; data_end_date: string; request: EngineRequest; plans: Plan[]; pareto_front_ids: string[]; top_ids: string[]; warnings: string[]; limits: string[]; }
export interface UiBundle { points: PointsFile; config: ConfigFile; manifest: Manifest; ndvi: Record<string, NdviFile>; }
export type AppErrorKind = "bundle_missing" | "bundle_invalid" | "network" | "engine_missing" | "calculation_timeout";
export interface AppError { kind: AppErrorKind; file?: string; detail: string; }
export type EngineErrorCode = "UNKNOWN_POINT" | "INVALID_REQUEST" | "NO_FEASIBLE_PLAN" | "DATA_GAP";
