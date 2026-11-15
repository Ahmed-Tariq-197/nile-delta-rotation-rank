/**
 * SYNTHETIC TEST FIXTURES. Not observed data. Used only by tests; never imported by the app.
 */
import type { ConfigFile, PointsFile } from "@/lib/contract";

export function syntheticPowerResponse(options: {
  solarUnit?: string;
  values?: Partial<Record<string, Record<string, number>>>;
  elevation?: number | null;
  omitParameters?: boolean;
} = {}) {
  const dates = ["20200101", "20200102", "20200103"];
  const base: Record<string, Record<string, number>> = {};
  for (const name of ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "WS2M", "ALLSKY_SFC_SW_DWN", "GWETROOT"])
    base[name] = Object.fromEntries(dates.map((date, index) => [date, index + 1]));
  base["GWETROOT"] = { "20200101": 0.5, "20200102": 0.6, "20200103": 0.7 };
  for (const [name, series] of Object.entries(options.values ?? {})) if (series) base[name] = series;
  const units: Record<string, string> = {
    T2M: "C", T2M_MAX: "C", T2M_MIN: "C", PRECTOTCORR: "mm/day", RH2M: "%", WS2M: "m/s",
    ALLSKY_SFC_SW_DWN: options.solarUnit ?? "MJ/m^2/day", GWETROOT: "1",
  };
  return {
    geometry: { type: "Point", coordinates: options.elevation === null ? [30, 31] : [30, 31, options.elevation ?? 5] },
    header: { fill_value: -999, time_standard: "UTC" },
    properties: { parameter: base },
    ...(options.omitParameters
      ? {}
      : { parameters: Object.fromEntries(Object.entries(units).map(([key, unit]) => [key, { units: unit, longname: key }])) }),
  };
}

const param = (grade: "verified" | "provisional" | "unresolved") => ({
  value: 1, min: 0, max: 2, unit: "days", source: "synthetic", locator: "synthetic",
  evidence_grade: grade, confidence: "low", notes: "SYNTHETIC",
});

function crop() {
  return {
    display_name: "Synthetic crop", legume: false, season: param("verified"),
    sowing_window: { start_md: param("provisional"), end_md: param("provisional") },
    season_length_days: param("verified"),
    stage_days: { ini: param("verified"), dev: param("verified"), mid: param("verified"), late: param("verified") },
    kc: { ini: param("verified"), mid: param("verified"), end: param("verified") },
    root_depth_m: param("verified"), depletion_fraction_p: param("verified"), ky_total: param("unresolved"),
    heat_stress: { threshold_c: param("verified"), sensitive_stage: param("verified") },
    n_removal_kg_ha: param("verified"), extra_water_mm: param("verified"),
    salinity: { threshold_ds_m: param("verified"), slope_pct_per_ds_m: param("verified") },
  };
}

export function syntheticConfig(): ConfigFile {
  return {
    schema_version: "synthetic",
    crops: { wheat: crop(), berseem: crop(), cotton: crop(), maize: crop(), rice: crop() },
    seasons: [],
    rotation_rules: [],
    assumptions: [],
    sources: [],
  } as unknown as ConfigFile;
}

export function syntheticPoints(): PointsFile {
  return {
    bundle_version: "",
    points: ["a", "b", "c"].map((id, index) => ({
      id, name: `Synthetic ${id}`, area: `Area ${id}`, latitude: 30 + index, longitude: 31,
      elevation_m: null, cell_id: "", location_note: "SYNTHETIC",
    })),
  };
}
