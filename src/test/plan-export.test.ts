import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { BundleData, EngineRequest } from "@/lib/contract";
import { runEngine } from "@/lib/engine-run";
import { plansToCsv } from "@/lib/plan-export";

const bundle = JSON.parse(readFileSync("public/data/snapshot.json", "utf8")) as BundleData;
const request: EngineRequest = {
  point_id: "p1",
  horizon_years: 3,
  priorities: { water: 1 / 3, soil_health: 1 / 3, climate_risk: 1 / 3 },
  soil: { salinity_ec_dsm: null },
  constraints: { allowed_crops: null, max_share_by_crop: null, seasonal_water_cap_mm: null },
};

describe("plan CSV export", () => {
  it("has a header plus one row per plan, rank 1 first", () => {
    const response = runEngine(request, bundle);
    const lines = plansToCsv(response).trim().split("\n");
    expect(lines).toHaveLength(response.plans.length + 1);
    expect(lines[1]?.startsWith(`1,${response.plans[0]?.id},`)).toBe(true);
  });
});
