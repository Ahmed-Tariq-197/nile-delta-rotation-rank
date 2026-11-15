import type { EngineResponse, NdviFile, Plan } from "@/lib/contract";

export type ActualBundle = {
  manifest: {
    bundle_version: string;
    built_at_utc: string;
    data: {
      end_date: string;
      time_standard: string;
      power: { community: string; start: string; end: string; variables: Record<string, { unit: string; label: "observed" | "modeled" | "assumed"; source: string }> };
      ndvi: { product: string; version: string; scale_applied: number; composite_counts: Record<string, { total: number; valid: number }> };
      cell_groups: { cells: { cell_id: string; point_ids: string[] }[]; inference?: string };
    };
    config: { parameter_counts: { verified: number; provisional: number; unresolved: number }; assumption_count: number; source_count: number };
    files: { path: string }[];
  };
  points: { bundle_version: string; points: { id: string; name: string; area: string; latitude: number; longitude: number; elevation_m: number | null; cell_id: string; location_note: string }[] };
  config: {
    crops: Record<string, { display_name: string; season: { value: string } }>;
    seasons: unknown[];
    rotation_rules: unknown[];
    assumptions: { path: string; decision_rule: string; reason: string; planner_fallback: string }[];
    sources: { id: string; citation: string; url_or_doi: string; date_opened: string; access_status: string }[];
  };
  ndvi: Record<string, NdviFile>;
};

export type BundleError = { kind: string; detail: string; file?: string };
export type EvidenceContext = { title: string; detail: string; plan?: Plan; pointId?: string; indicator?: string };

export type ViewProps = {
  bundle: ActualBundle | null;
  response: EngineResponse | null;
  retry: () => void;
  loading: boolean;
  error: BundleError | null;
  openEvidence: (context: EvidenceContext) => void;
};