import type { EngineRequest, Priorities } from "@/lib/contract";

export function normalizeWeights(priorities: Priorities): Priorities | null {
  const total = priorities.water + priorities.soil_health + priorities.climate_risk;
  if (!(total > 0)) return null;
  return {
    water: priorities.water / total,
    soil_health: priorities.soil_health / total,
    climate_risk: priorities.climate_risk / total,
  };
}

export function medianCadence(dates: string[]): number | null {
  if (dates.length < 2) return null;
  const gaps: number[] = [];
  for (let index = 1; index < dates.length; index += 1) {
    const earlier = dates[index - 1];
    const later = dates[index];
    if (!earlier || !later) continue;
    const days = (Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / 86_400_000;
    if (Number.isFinite(days) && days > 0) gaps.push(days);
  }
  if (gaps.length === 0) return null;
  gaps.sort((a, b) => a - b);
  const middle = Math.floor(gaps.length / 2);
  const before = gaps[middle - 1];
  const after = gaps[middle];
  if (gaps.length % 2 === 1) return after ?? null;
  if (before === undefined || after === undefined) return null;
  return (before + after) / 2;
}

export function parsePlannerHash(hash: string) {
  const [path, queryString = ""] = hash.replace(/^#/, "").split("?", 2);
  const section = ["/method", "/global", "/about"].includes(path ?? "") ? path : "/";
  const query = new URLSearchParams(queryString);
  const priorityText = query.get("w");
  const weightValues = priorityText?.split(",").map(Number);
  const hasValidWeights =
    weightValues?.length === 3 &&
    weightValues.every((value) => Number.isFinite(value) && value >= 0 && value <= 100);
  const parseOptionalNumber = (key: string) => {
    const value = query.get(key);
    if (value === null || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };
  const cropIds = query.get("crops")?.split(",").filter((crop) =>
    ["wheat", "berseem", "cotton", "maize", "rice"].includes(crop),
  );
  const invalid =
    (priorityText !== null && !hasValidWeights) ||
    (query.has("ec") && query.get("ec") !== "" && parseOptionalNumber("ec") === null) ||
    (query.has("cap") && query.get("cap") !== "" && parseOptionalNumber("cap") === null);

  return {
    section,
    pointId: query.get("p"),
    priorities: hasValidWeights
      ? {
          water: (weightValues?.[0] ?? 0) / 100,
          soil_health: (weightValues?.[1] ?? 0) / 100,
          climate_risk: (weightValues?.[2] ?? 0) / 100,
        }
      : { water: 1 / 3, soil_health: 1 / 3, climate_risk: 1 / 3 },
    salinity: parseOptionalNumber("ec"),
    allowedCrops: cropIds?.length === 0 || cropIds === undefined ? null : cropIds,
    waterCap: parseOptionalNumber("cap"),
    planId: query.get("plan"),
    invalid,
  };
}

export function encodePlannerHash(
  section: string,
  state: {
    pointId: string | null;
    priorities: Priorities;
    salinity: number | null;
    allowedCrops: string[] | null;
    waterCap: number | null;
    planId: string | null;
  },
) {
  if (section !== "/") return `#${section}`;
  const params = new URLSearchParams();
  if (state.pointId) params.set("p", state.pointId);
  const values = [state.priorities.water, state.priorities.soil_health, state.priorities.climate_risk];
  if (values.some((weight) => Math.abs(weight - 1 / 3) > 0.0001)) {
    params.set("w", values.map((weight) => String(Math.round(weight * 100))).join(","));
  }
  if (state.salinity !== null) params.set("ec", String(state.salinity));
  if (state.allowedCrops) params.set("crops", state.allowedCrops.join(","));
  if (state.waterCap !== null) params.set("cap", String(state.waterCap));
  if (state.planId) params.set("plan", state.planId);
  const queryString = params.toString();
  return queryString ? `#/?${queryString}` : "#/";
}

export function makeEmptyRequest(pointId: string, priorities: Priorities): EngineRequest {
  return {
    point_id: pointId,
    horizon_years: 3,
    priorities,
    soil: { salinity_ec_dsm: null },
    constraints: { allowed_crops: null, max_share_by_crop: null, seasonal_water_cap_mm: null },
  };
}