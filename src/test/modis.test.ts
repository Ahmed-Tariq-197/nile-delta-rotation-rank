import { describe, expect, it } from "vitest";

import { buildNdviFile, chunkDates, cleanNdvi, parseBands, parseSubset } from "@/lib/data/modis";

describe("MODIS band metadata", () => {
  it("uses served values when present", () => {
    const meta = parseBands({
      bands: [
        {
          band: "250m_16_days_NDVI",
          scale_factor: "0.0001",
          fill_value: "-3000",
          valid_range: "-2000 to 10000",
        },
        { band: "250m_16_days_pixel_reliability", fill_value: "-1" },
      ],
    });
    expect(meta.source.scale_factor).toBe("served");
    expect(meta.valid_min).toBe(-2000);
  });

  it("falls back to documented values and flags them", () => {
    const meta = parseBands(null);
    expect(meta.scale_factor).toBe(0.0001);
    expect(meta.fill_value).toBe(-3000);
    expect(meta.source.fill_value).toBe("documented");
  });
});

describe("NDVI cleaning", () => {
  const meta = parseBands(null);
  it("nulls fill and out-of-range values and scales the rest", () => {
    expect(cleanNdvi(-3000, meta)).toBeNull();
    expect(cleanNdvi(-2500, meta)).toBeNull();
    expect(cleanNdvi(12000, meta)).toBeNull();
    expect(cleanNdvi(4259, meta)).toBeCloseTo(0.4259);
  });

  it("sets quality_ok only when NDVI is valid and reliability is 0", () => {
    const dates = ["A2020001", "A2020017", "A2020033"].map((modis_date, index) => ({
      modis_date,
      calendar_date: `2020-01-0${index + 1}`,
    }));
    const records = [
      { band: "250m_16_days_NDVI", calendar_date: "2020-01-01", modis_date: "", value: 5000 },
      {
        band: "250m_16_days_pixel_reliability",
        calendar_date: "2020-01-01",
        modis_date: "",
        value: 0,
      },
      { band: "250m_16_days_NDVI", calendar_date: "2020-01-02", modis_date: "", value: 5000 },
      {
        band: "250m_16_days_pixel_reliability",
        calendar_date: "2020-01-02",
        modis_date: "",
        value: 1,
      },
      { band: "250m_16_days_NDVI", calendar_date: "2020-01-03", modis_date: "", value: -3000 },
      {
        band: "250m_16_days_pixel_reliability",
        calendar_date: "2020-01-03",
        modis_date: "",
        value: 0,
      },
    ];
    const file = buildNdviFile("a", dates, records, meta);
    expect(file.ndvi).toEqual([0.5, 0.5, null]);
    expect(file.quality_ok).toEqual([true, false, false]);
    expect(file.product).toBe("MOD13Q1");
    expect(file.version).toBe("061");
  });

  it("splits dates into requests of at most 10", () => {
    expect(
      chunkDates(Array.from({ length: 23 }, (_, index) => index)).map((chunk) => chunk.length),
    ).toEqual([10, 10, 3]);
  });

  it("rejects a subset response for a different collection", () => {
    const result = parseSubset({ header: "https://example.test/MOD09A1/subset", subset: [] });
    expect(result.ok).toBe(false);
  });
});
