import { describe, expect, it } from "vitest";

import { encodePlannerHash, medianCadence, normalizeWeights, parsePlannerHash } from "@/lib/derive";

describe("planner derivations", () => {
  it("normalizes priorities to a total of one", () => {
    expect(normalizeWeights({ water: 1, soil_health: 2, climate_risk: 1 })).toEqual({
      water: 0.25,
      soil_health: 0.5,
      climate_risk: 0.25,
    });
  });

  it("keeps zero priorities invalid instead of inventing weights", () => {
    expect(normalizeWeights({ water: 0, soil_health: 0, climate_risk: 0 })).toBeNull();
  });

  it("uses the median interval between supplied dates", () => {
    expect(medianCadence(["2026-01-01", "2026-01-04", "2026-01-11"])).toBe(5);
  });

  it("ignores invalid URL weights and reports them", () => {
    const parsed = parsePlannerHash("#/?w=101,0,0&ec=-2");
    expect(parsed.invalid).toBe(true);
    expect(parsed.priorities).toEqual({ water: 1 / 3, soil_health: 1 / 3, climate_risk: 1 / 3 });
    expect(parsed.salinity).toBeNull();
  });

  it("encodes selected point and crop constraint into a shareable hash", () => {
    const hash = encodePlannerHash("/", {
      pointId: "p1",
      priorities: { water: 0.5, soil_health: 0.25, climate_risk: 0.25 },
      salinity: null,
      allowedCrops: ["wheat", "rice"],
      waterCap: null,
      planId: null,
    });
    expect(hash).toBe("#/?p=p1&w=50%2C25%2C25&crops=wheat%2Crice");
  });
});
