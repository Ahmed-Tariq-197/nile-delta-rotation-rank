import { describe, expect, it } from "vitest";

import { assembleBundle, canonicalJson, computeCellGroups } from "@/lib/data/bundle";
import { parsePowerResponse, type PowerPointResult } from "@/lib/data/power";
import { validateBundleData } from "@/lib/data/validate";
import { syntheticConfig, syntheticPoints, syntheticPowerResponse } from "./fixtures/synthetic";

function power(id: string, shift = 0): PowerPointResult {
  const response = syntheticPowerResponse({
    values: { T2M: { "20200101": 1 + shift, "20200102": 2, "20200103": 3 } },
  });
  const result = parsePowerResponse(response, id, "https://example.test", "2026-01-01T00:00:00Z");
  if (!result.ok) throw new Error("fixture failed");
  return result.value;
}

const input = () => ({
  points: syntheticPoints(),
  config: syntheticConfig(),
  power: { a: power("a"), b: power("b"), c: power("c", 5) },
  ndvi: {},
  bandMeta: null,
  retrievedAt: "2026-01-01T00:00:00Z",
});

describe("bundle assembly", () => {
  it("groups points with identical series into one cell", () => {
    const climate = Object.fromEntries(Object.entries(input().power).map(([id, item]) => [id, item.climate]));
    const groups = computeCellGroups(climate, ["a", "b", "c"], ["T2M"]);
    expect(groups.cells).toEqual([
      { cell_id: "cell_1", point_ids: ["a", "b"] },
      { cell_id: "cell_2", point_ids: ["c"] },
    ]);
  });

  it("produces the same bundle version for the same content", async () => {
    const first = await assembleBundle(input());
    const second = await assembleBundle({ ...input(), retrievedAt: "2026-02-02T00:00:00Z" });
    expect(first.manifest.bundle_version).toMatch(/^[0-9a-f]{64}$/);
    expect(first.manifest.bundle_version).toBe(second.manifest.bundle_version);
    expect(first.points.bundle_version).toBe(first.manifest.bundle_version);
    expect(first.points.points[0]?.cell_id).toBe("cell_1");
    expect(first.manifest.config.parameter_counts).toEqual({ verified: 80, provisional: 10, unresolved: 5 });
  });

  it("canonical JSON ignores key order", () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });

  it("an assembled bundle passes snapshot validation, a corrupted one does not", async () => {
    const bundle = await assembleBundle(input());
    expect(validateBundleData(JSON.parse(JSON.stringify(bundle))).ok).toBe(true);
    const broken = JSON.parse(JSON.stringify(bundle));
    delete broken.climate.b;
    const result = validateBundleData(broken);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join(" ")).toContain("b has no climate record");
  });
});
