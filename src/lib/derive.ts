import type { EngineRequest, NdviFile, Plan, Priorities, UiBundle } from "@/lib/contract";

export function ndviNote(file: NdviFile) {
  const valid = file.composite_dates
    .map((date, index) => ({ date, value: file.ndvi[index], quality: file.quality_ok[index] }))
    .filter((entry): entry is { date: string; value: number; quality: true } =>
      entry.quality === true && entry.value !== null && entry.value !== undefined && Number.isFinite(entry.value),
    );
  const latest = valid.at(-1);
  if (!latest) return null;
  const percentileInRecord = valid.filter((entry) => entry.value <= latest.value).length / valid.length;
  return { date: latest.date, value: latest.value, percentileInRecord };
}

export function cellSharing(bundle: UiBundle, pointId: string): string[] {
  const cellId = bundle.manifest.data.cell_groups.point_to_cell[pointId];
  if (!cellId) return [];
  const group = bundle.manifest.data.cell_groups.cells.find((cell) => cell.cell_id === cellId);
  return group?.point_ids.filter((id) => id !== pointId) ?? [];
}

export function whyThisPlan(plan: Plan, request: EngineRequest, pointName: string, totalPlans: number): string {
  const weights = normalizeWeights(request.priorities);
  const fallback = { water: 0, soil_health: 0, climate_risk: 0 };
  const used = weights ?? fallback;
  const mainIndicator = Object.entries(plan.indicators).sort((a, b) => {
    const left = a[1].drivers[0]?.share ?? 0;
    const right = b[1].drivers[0]?.share ?? 0;
    return right - left;
  })[0];
  const driver = mainIndicator?.[1].drivers[0];
  const name = mainIndicator?.[0] === "water_demand_mm_total" ? "water demand" : mainIndicator?.[0] === "soil_health_index" ? "soil health" : "climate risk";
  const sentences = [
    `This plan ranks ${plan.rank} of ${totalPlans} plans for ${pointName} that meet your constraints.`,
    `You weighted water ${Math.round(used.water * 100)} percent, soil health ${Math.round(used.soil_health * 100)} percent and climate risk ${Math.round(used.climate_risk * 100)} percent.`,
  ];
  if (driver) sentences.push(`Its largest driver of ${name} is ${driver.label} (${Math.round(driver.share * 100)} percent).`);
  sentences.push(`The weakest evidence grade behind it is ${plan.evidence.weakest_grade}; ${plan.evidence.provisional_count} parameters are provisional and ${plan.evidence.unresolved_count} are unresolved.`);
  if (plan.pareto) sentences.push("It is on the trade-off front: no other plan is better on every indicator.");
  return sentences.join(" ");
}

export function paretoGeometry(plans: Plan[], frontIds: string[]) {
  const byId = new Map(plans.map((plan) => [plan.id, plan]));
  const front = frontIds.map((id) => byId.get(id)).filter((plan): plan is Plan => plan !== undefined).sort((a, b) => a.indicators.water_demand_mm_total.value - b.indicators.water_demand_mm_total.value);
  const points = front.map((plan) => ({ x: plan.indicators.water_demand_mm_total.value, y: plan.indicators.soil_health_index.value }));
  const path = points.map((point, index) => `${index === 0 ? `M ${point.x} ${point.y}` : `H ${point.x} V ${point.y}`}`).join(" ");
  const center = points.length ? points.reduce((total, point) => ({ x: total.x + point.x / points.length, y: total.y + point.y / points.length }), { x: 0, y: 0 }) : null;
  const lastPoint = points.at(-1);
  const rotation = points.length > 1 && center && lastPoint ? Math.atan2(lastPoint.y - center.y, lastPoint.x - center.x) : 0;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const ellipse = center && points.length >= 3 ? {
    cx: center.x,
    cy: center.y,
    rx: Math.max(28, (Math.max(...xs) - Math.min(...xs)) / 2 + 24),
    ry: Math.max(16, (Math.max(...ys) - Math.min(...ys)) / 2 + 24),
    rotation: rotation * 180 / Math.PI,
  } : null;
  return { points, path, ellipse };
}

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