import type { EngineResponse } from "@/lib/contract";

function cell(value: string | number | boolean | null) {
  const text = value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One row per plan, with the engine's values exactly as returned. */
export function plansToCsv(response: EngineResponse): string {
  const header = [
    "rank",
    "plan_id",
    "score",
    "pareto",
    "y1_winter",
    "y1_summer",
    "y2_winter",
    "y2_summer",
    "y3_winter",
    "y3_summer",
    "water_demand_mm_total",
    "water_low",
    "water_high",
    "soil_health_index",
    "climate_risk_index",
    "weakest_grade",
  ];
  const rows = response.plans.map((plan) => {
    const crop = (year: number, season: string) =>
      plan.slots.find((slot) => slot.year === year && slot.season === season)?.crop_id ?? null;
    const w = plan.indicators.water_demand_mm_total;
    return [
      plan.rank,
      plan.id,
      plan.score,
      plan.pareto,
      crop(1, "winter"),
      crop(1, "summer"),
      crop(2, "winter"),
      crop(2, "summer"),
      crop(3, "winter"),
      crop(3, "summer"),
      w.value,
      w.uncertainty?.low ?? null,
      w.uncertainty?.high ?? null,
      plan.indicators.soil_health_index.value,
      plan.indicators.climate_risk_index.value,
      plan.evidence.weakest_grade,
    ]
      .map(cell)
      .join(",");
  });
  return [header.join(","), ...rows].join("\n") + "\n";
}

export function downloadText(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
