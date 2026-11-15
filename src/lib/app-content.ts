export const NAVIGATION_ITEMS = [
  { path: "/", label: "Planner" },
  { path: "/method", label: "Method and data" },
  { path: "/global", label: "Global" },
  { path: "/about", label: "About" },
] as const;

export const CROP_LIST = [
  { id: "wheat", name: "Wheat", season: "winter", letter: "W", color: "var(--wheat)" },
  { id: "berseem", name: "Berseem", season: "winter", letter: "B", color: "var(--berseem)" },
  { id: "cotton", name: "Cotton", season: "summer", letter: "C", color: "var(--cotton)" },
  { id: "maize", name: "Maize", season: "summer", letter: "M", color: "var(--maize)" },
  { id: "rice", name: "Rice", season: "summer", letter: "R", color: "var(--rice)" },
] as const;

export const POWER_VARIABLE_LABELS: Record<string, string> = {
  T2M: "Average temperature",
  T2M_MAX: "Maximum temperature",
  T2M_MIN: "Minimum temperature",
  PRECTOTCORR: "Corrected precipitation",
  RH2M: "Relative humidity",
  WS2M: "Wind speed",
  ALLSKY_SFC_SW_DWN: "Solar radiation",
  GWETROOT: "Root-zone soil wetness",
};

export const SCHEMA_ROWS = [
  ["points.json", "points.schema.json", "Point identifiers, coordinates and grid-cell ids."],
  ["climate/<id>.json", "climate.schema.json", "Daily values, units, dates and labels."],
  ["ndvi/<id>.json", "ndvi.schema.json", "Composite dates, vegetation values and quality flags."],
  ["config.json", "config.schema.json", "Crop settings, evidence and source records."],
  ["manifest.json", "manifest.schema.json", "Versions, files, date coverage and completeness."],
  ["Engine request", "engine-request.schema.json", "Point, priorities, soil and constraints."],
  ["Engine response", "engine-response.schema.json", "Plans, indicators, ranks and evidence."],
] as const;

export const REGION_FILES = [
  "points.json",
  "climate/<point id>.json",
  "ndvi/<point id>.json",
  "config.json",
  "manifest.json",
  "data/points.md",
  "data/snapshots/",
  "config/crops.yaml",
  "config/seasons.yaml",
  "config/rotation_rules.yaml",
  "config/assumptions.yaml",
  "docs/SOURCES.md",
] as const;

export const DATA_LIMITS = [
  "Climate values are NASA POWER grid-cell model output (meteorology: MERRA-2, with GEOS FP-IT for the most recent period; solar: CERES SYN1deg, with FLASHFlux for the most recent period). They describe a cell, not a field.",
  "The source of each POWER series changes inside the period, from the long-term product to the near-real-time product. Consistency across that change was not assessed.",
  "The data are the latest available at retrieval, not real-time. The request ends 10 days before the run date because the solar series lags by about a week; the most recent solar days can still be missing.",
  "Cell groups are inferred from identical returned values and assume NASA POWER does not interpolate between cells. Points in the same cell do not have independent climate series.",
  "A 250 m MODIS NDVI pixel can mix fields, canals, roads and villages. Composite dates are the start of each 16-day window, not acquisition dates. NDVI is context only and never enters the scores.",
  "Point coordinates are proposed. None was checked on imagery or a map.",
  "Elevation is the value NASA POWER returns for its cell, not a surveyed value.",
  "Real-world validation was not performed, and no outside review took place.",
];
