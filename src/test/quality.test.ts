import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import type { BundleData, ClimateFile } from "@/lib/contract";
import { solarGaps, trailingRepeat } from "@/lib/data/quality";
import { runEngine } from "@/lib/engine-run";

function file(solar: (number | null)[], wet: (number | null)[]): ClimateFile {
  const dates = solar.map((_, i) => `2026-01-${String(i + 1).padStart(2, "0")}`);
  const series = (values: (number | null)[]) => ({ unit: "", label: "", source: "", values });
  return {
    point_id: "x",
    time_standard: "UTC",
    start: dates[0]!,
    end: dates.at(-1)!,
    dates,
    variables: { ALLSKY_SFC_SW_DWN: series(solar), GWETROOT: series(wet) },
  } as unknown as ClimateFile;
}

describe("data quality counts", () => {
  it("counts days with no solar value", () => {
    const [gap] = solarGaps({ x: file([20, 21, null, null], [0.3, 0.3, 0.3, 0.3]) });
    expect(gap).toMatchObject({
      missingDays: 2,
      firstMissing: "2026-01-03",
      lastMissing: "2026-01-04",
    });
  });
  it("measures the run of one value at the end of a series", () => {
    const [run] = trailingRepeat(
      { x: file([1, 1, 1, 1, 1], [0.2, 0.3, 0.27, 0.27, 0.27]) },
      "GWETROOT",
    );
    expect(run).toMatchObject({ days: 3, value: 0.27, from: "2026-01-03", to: "2026-01-05" });
  });
  it("reports nothing when the last two values differ", () => {
    expect(trailingRepeat({ x: file([1, 1], [0.2, 0.3]) }, "GWETROOT")).toEqual([]);
  });
  it("the saved snapshot has missing solar days and still gives plans", () => {
    const bundle = JSON.parse(readFileSync("public/data/snapshot.json", "utf8")) as BundleData;
    expect(solarGaps(bundle.climate).every((gap) => gap.missingDays > 0)).toBe(true);
    const response = runEngine(
      {
        point_id: "p1",
        horizon_years: 3,
        priorities: { water: 1 / 3, soil_health: 1 / 3, climate_risk: 1 / 3 },
        soil: { salinity_ec_dsm: null },
        constraints: { allowed_crops: null, max_share_by_crop: null, seasonal_water_cap_mm: null },
      },
      bundle,
    );
    expect(response.plans.length).toBeGreaterThan(0);
  });
});
