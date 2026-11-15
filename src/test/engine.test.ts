import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateResponse } from "@/engine";
import type { BundleData, EngineRequest } from "@/lib/contract";
import { runEngine } from "@/lib/engine-run";

const bundle = JSON.parse(readFileSync("public/data/snapshot.json", "utf8")) as BundleData;
const base = (point_id: string): EngineRequest => ({
  point_id,
  horizon_years: 3,
  priorities: { water: 1 / 3, soil_health: 1 / 3, climate_risk: 1 / 3 },
  soil: { salinity_ec_dsm: null },
  constraints: { allowed_crops: null, max_share_by_crop: null, seasonal_water_cap_mm: null },
});

describe("engine on the saved snapshot", () => {
  for (const point of bundle.points.points) {
    it(`returns valid ranked plans for ${point.id}`, () => {
      const response = runEngine(base(point.id), bundle);
      expect(response.plans.length).toBe(216);
      expect(validateResponse(response).ok).toBe(true);
    });
  }
  it("winter-only crops give the no-feasible-plan message", () => {
    const request = base("p1");
    request.constraints.allowed_crops = ["wheat", "berseem"];
    expect(() => runEngine(request, bundle)).toThrow();
    try {
      runEngine(request, bundle);
    } catch (e) {
      expect(e).toMatchObject({ kind: "engine_error", code: "NO_FEASIBLE_PLAN" });
    }
  });
  it("an unknown point gives the unknown-point message", () => {
    try {
      runEngine(base("nowhere"), bundle);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ code: "UNKNOWN_POINT" });
    }
  });
  it("an invalid request gives the invalid-request message", () => {
    try {
      runEngine({ ...base("p1"), horizon_years: 5 } as unknown as EngineRequest, bundle);
      expect.unreachable();
    } catch (e) {
      expect(e).toMatchObject({ code: "INVALID_REQUEST" });
    }
  });
});
