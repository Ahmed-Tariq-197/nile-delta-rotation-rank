import { describe, expect, it } from "vitest";

import { buildPowerUrl, parsePowerResponse, powerEndDate, solarFactor } from "@/lib/data/power";
import { syntheticPowerResponse } from "./fixtures/synthetic";

const parse = (json: unknown) =>
  parsePowerResponse(json, "a", "https://example.test", "2026-01-01T00:00:00Z");

describe("solar unit conversion", () => {
  it.each([
    ["MJ/m^2/day", 1],
    ["kW-hr/m^2/day", 3.6],
    ["kWh/m^2/day", 3.6],
    ["Wh/m^2", 0.0036],
    ["W/m^2", 0.0864],
  ])("converts %s by %d", (unit, factor) => {
    expect(solarFactor(unit)).toBe(factor);
    const result = parse(syntheticPowerResponse({ solarUnit: unit }));
    expect(result.ok && result.value.climate.variables.ALLSKY_SFC_SW_DWN.values[1]).toBeCloseTo(
      2 * factor,
    );
  });

  it("rejects an unknown solar unit with a structured error naming it", () => {
    const result = parse(syntheticPowerResponse({ solarUnit: "langley/day" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("unknown_unit");
      expect(result.error.message).toContain("langley/day");
    }
  });
});

describe("POWER cleaning", () => {
  it("turns the header fill value into null and counts it", () => {
    const result = parse(
      syntheticPowerResponse({
        values: { T2M: { "20200101": -999, "20200102": 2, "20200103": 3 } },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.climate.variables.T2M.values).toEqual([null, 2, 3]);
      expect(result.value.missing_counts.T2M).toBe(1);
      expect(result.value.climate.dates[0]).toBe("2020-01-01");
    }
  });

  it("sets out-of-range humidity, wetness and negative rain to null with warnings", () => {
    const result = parse(
      syntheticPowerResponse({
        values: {
          RH2M: { "20200101": 101, "20200102": 50, "20200103": -1 },
          GWETROOT: { "20200101": 1.2, "20200102": 0.4, "20200103": 0.3 },
          PRECTOTCORR: { "20200101": -0.5, "20200102": 0, "20200103": 4 },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.climate.variables.RH2M.values).toEqual([null, 50, null]);
      expect(result.value.climate.variables.GWETROOT.values).toEqual([null, 0.4, 0.3]);
      expect(result.value.climate.variables.PRECTOTCORR.values).toEqual([null, 0, 4]);
      expect(result.value.warnings.length).toBe(3);
    }
  });

  it("labels meteorology and solar as modeled with their sources", () => {
    const result = parse(syntheticPowerResponse());
    if (!result.ok) throw new Error("expected ok");
    expect(result.value.climate.variables.T2M.label).toBe("modeled");
    expect(result.value.climate.variables.T2M.source).toContain("MERRA-2");
    expect(result.value.climate.variables.ALLSKY_SFC_SW_DWN.source).toContain("satellite-derived");
  });

  it("stops with a structured error when units are not served", () => {
    const result = parse(syntheticPowerResponse({ omitParameters: true }));
    expect(!result.ok && result.error.code).toBe("missing_metadata");
  });

  it("reads elevation from the third coordinate, or warns when it is absent", () => {
    const withElevation = parse(syntheticPowerResponse({ elevation: 7.5 }));
    expect(withElevation.ok && withElevation.value.elevation_m).toBe(7.5);
    const without = parse(syntheticPowerResponse({ elevation: null }));
    expect(without.ok && without.value.elevation_m).toBeNull();
    expect(without.ok && without.value.warnings.some((item) => item.startsWith("Elevation"))).toBe(
      true,
    );
  });

  it("ends the request 10 days before the run date and builds the documented query", () => {
    expect(powerEndDate(new Date("2026-11-15T12:00:00Z"))).toBe("20261105");
    const url = buildPowerUrl(31.1, 30.9, "20261105");
    expect(url).toContain("start=20200101");
    expect(url).toContain("end=20261105");
    expect(url).toContain("community=AG");
    expect(url).toContain("time-standard=UTC");
  });
});
