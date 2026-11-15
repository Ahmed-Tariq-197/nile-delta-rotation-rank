export const NAVIGATION_ITEMS = [
  { path: "/", label: "Planner" },
  { path: "/method", label: "Method and data" },
  { path: "/global", label: "Global" },
  { path: "/about", label: "About" },
] as const;

export const PROPOSED_POINTS = [
  { id: "p1", area: "Kafr El-Sheikh" },
  { id: "p2", area: "Dakahlia" },
  { id: "p3", area: "Gharbia" },
  { id: "p4", area: "Beheira" },
  { id: "p5", area: "Sharqia" },
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