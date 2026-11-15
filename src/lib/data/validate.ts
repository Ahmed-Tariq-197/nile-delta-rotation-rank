import { z } from "zod";

import type { BundleData, ConfigFile, PointsFile } from "@/lib/contract";

const grade = z.enum(["verified", "provisional", "unresolved"]);
const label = z.enum(["observed", "modeled", "assumed"]);
const finiteOrNull = z.number().finite().nullable();

const param = z.object({
  value: z.union([z.number().finite(), z.string(), z.null()]),
  min: finiteOrNull,
  max: finiteOrNull,
  unit: z.string(),
  source: z.string(),
  locator: z.string(),
  evidence_grade: grade,
  confidence: z.enum(["high", "medium", "low"]),
  notes: z.string(),
});

const crop = z.object({
  display_name: z.string(),
  legume: z.boolean(),
  season: param,
  sowing_window: z.object({ start_md: param, end_md: param }),
  season_length_days: param,
  stage_days: z.object({ ini: param, dev: param, mid: param, late: param }),
  kc: z.object({ ini: param, mid: param, end: param }),
  root_depth_m: param,
  depletion_fraction_p: param,
  ky_total: param,
  heat_stress: z.object({ threshold_c: param, sensitive_stage: param }),
  n_removal_kg_ha: param,
  extra_water_mm: param,
  salinity: z.object({ threshold_ds_m: param, slope_pct_per_ds_m: param }),
});

export const configSchema = z.object({
  schema_version: z.string(),
  crops: z.object({ wheat: crop, berseem: crop, cotton: crop, maize: crop, rice: crop }),
  seasons: z.array(
    z.object({
      id: z.enum(["winter", "summer"]),
      months: z.array(z.number().int().min(1).max(12)),
      description: z.string(),
      source: z.string(),
      locator: z.string(),
      evidence_grade: grade,
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
  rotation_rules: z.array(
    z.object({
      id: z.string(),
      type: z.enum(["n_credit", "previous_crop_effect", "repetition_penalty", "season_constraint"]),
      from: z.string(),
      to: z.string(),
      effect: param,
      direction: z.enum(["positive", "negative"]),
      notes: z.string(),
    }),
  ),
  assumptions: z.array(
    z.object({
      path: z.string(),
      decision_rule: z.enum(["D1", "D2", "D3", "D4", "D5", "D6", "D7"]),
      reason: z.string(),
      planner_fallback: z.string(),
    }),
  ),
  sources: z.array(
    z.object({
      id: z.string(),
      citation: z.string(),
      url_or_doi: z.string(),
      date_opened: z.string(),
      access_status: z.enum(["opened", "not accessible"]),
    }),
  ),
});

const point = z.object({
  id: z.string().min(1),
  name: z.string(),
  area: z.string(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  elevation_m: finiteOrNull,
  cell_id: z.string(),
  location_note: z.string(),
});

export const pointsSchema = z.object({
  bundle_version: z.string(),
  points: z.array(point).min(1, "The locations list is empty."),
});

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD date.");
const climateVariable = z.object({
  unit: z.string(),
  label,
  source: z.string(),
  values: z.array(finiteOrNull),
});
const variableNames = [
  "T2M",
  "T2M_MAX",
  "T2M_MIN",
  "PRECTOTCORR",
  "RH2M",
  "WS2M",
  "ALLSKY_SFC_SW_DWN",
  "GWETROOT",
] as const;

const climate = z
  .object({
    point_id: z.string(),
    time_standard: z.literal("UTC"),
    start: isoDate,
    end: isoDate,
    dates: z.array(isoDate).min(1),
    variables: z.object(
      Object.fromEntries(variableNames.map((name) => [name, climateVariable])) as Record<
        (typeof variableNames)[number],
        typeof climateVariable
      >,
    ),
  })
  .superRefine((file, context) => {
    for (const name of variableNames) {
      if (file.variables[name].values.length !== file.dates.length)
        context.addIssue({
          code: "custom",
          path: ["variables", name, "values"],
          message: "The number of values does not match the number of dates.",
        });
    }
  });

const ndvi = z
  .object({
    point_id: z.string(),
    product: z.string(),
    version: z.string(),
    scale_applied: z.number().finite(),
    composite_dates: z.array(isoDate),
    ndvi: z.array(z.number().min(-1, "NDVI below -1.").max(1, "NDVI above 1.").nullable()),
    quality_ok: z.array(z.boolean()),
  })
  .superRefine((file, context) => {
    if (
      file.ndvi.length !== file.composite_dates.length ||
      file.quality_ok.length !== file.composite_dates.length
    )
      context.addIssue({
        code: "custom",
        path: ["ndvi"],
        message: "NDVI, quality and date lists have different lengths.",
      });
  });

const manifest = z.object({
  bundle_version: z.string(),
  built_at_utc: z.string(),
  data: z.object({
    power: z
      .object({
        community: z.string(),
        start: z.string(),
        end: z.string(),
        variables: z.record(z.object({ unit: z.string(), label, source: z.string() })),
        row_counts: z.record(z.number()),
        missing_counts: z.record(z.record(z.number())),
        source_files: z.array(z.unknown()),
      })
      .passthrough(),
    ndvi: z
      .object({
        product: z.string(),
        version: z.string(),
        scale_applied: z.number(),
        label,
        source_by_point: z.record(z.string()),
        composite_counts: z.record(z.object({ total: z.number(), valid: z.number() })),
        source_files: z.array(z.unknown()),
      })
      .passthrough(),
    end_date: isoDate,
    time_standard: z.literal("UTC"),
    cell_groups: z
      .object({
        point_to_cell: z.record(z.string()),
        cells: z.array(z.object({ cell_id: z.string(), point_ids: z.array(z.string()) })),
      })
      .passthrough(),
  }),
  config: z.object({
    schema_version: z.string(),
    source_files: z.array(z.unknown()),
    parameter_counts: z.object({
      verified: z.number(),
      provisional: z.number(),
      unresolved: z.number(),
    }),
    assumption_count: z.number(),
    source_count: z.number(),
  }),
  files: z.array(z.unknown()),
  warnings: z.array(z.string()),
});

export const bundleSchema = z
  .object({
    points: pointsSchema,
    climate: z.record(climate),
    ndvi: z.record(ndvi),
    config: configSchema,
    manifest,
  })
  .superRefine((bundle, context) => {
    for (const item of bundle.points.points) {
      if (!bundle.climate[item.id])
        context.addIssue({
          code: "custom",
          path: ["climate", item.id],
          message: `Location ${item.id} has no climate record.`,
        });
    }
    for (const [id, file] of Object.entries(bundle.climate)) {
      if (file.point_id !== id)
        context.addIssue({
          code: "custom",
          path: ["climate", id, "point_id"],
          message: `Climate record keyed ${id} names ${file.point_id}.`,
        });
    }
    if (bundle.points.bundle_version !== bundle.manifest.bundle_version)
      context.addIssue({
        code: "custom",
        path: ["manifest", "bundle_version"],
        message: "Bundle versions in points and manifest differ.",
      });
  });

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function describe(error: z.ZodError, limit = 8) {
  const messages = error.issues.map(
    (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`,
  );
  return messages.length > limit
    ? [...messages.slice(0, limit), `${messages.length - limit} more problems.`]
    : messages;
}

function run<T>(schema: z.ZodTypeAny, value: unknown): Validation<T> {
  const parsed = schema.safeParse(value);
  return parsed.success
    ? { ok: true, value: value as T }
    : { ok: false, errors: describe(parsed.error) };
}

export const validateConfig = (value: unknown) => run<ConfigFile>(configSchema, value);
export const validatePoints = (value: unknown) => run<PointsFile>(pointsSchema, value);
/** Validate a complete frozen BundleData (for example snapshot.json). Messages name the failing path. */
export const validateBundleData = (value: unknown) => run<BundleData>(bundleSchema, value);
