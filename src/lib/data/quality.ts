import type { ClimateFile } from "@/lib/contract";

export interface SolarGap {
  pointId: string;
  missingDays: number;
  firstMissing: string | null;
  lastMissing: string | null;
}

export interface RepeatedRun {
  pointId: string;
  value: number;
  days: number;
  from: string;
  to: string;
}

/** Count days with no solar value at each point, from the loaded series. */
export function solarGaps(climate: Record<string, ClimateFile>): SolarGap[] {
  return Object.entries(climate).map(([pointId, file]) => {
    const values = file.variables.ALLSKY_SFC_SW_DWN?.values ?? [];
    const missing = file.dates.filter((_, index) => values[index] == null);
    return {
      pointId,
      missingDays: missing.length,
      firstMissing: missing[0] ?? null,
      lastMissing: missing.at(-1) ?? null,
    };
  });
}

/** The run of identical values that ends on the last date of a series, if it spans more than one day. */
export function trailingRepeat(
  climate: Record<string, ClimateFile>,
  variable: keyof ClimateFile["variables"],
): RepeatedRun[] {
  const runs: RepeatedRun[] = [];
  for (const [pointId, file] of Object.entries(climate)) {
    const values = file.variables[variable]?.values ?? [];
    let end = values.length - 1;
    while (end >= 0 && values[end] == null) end -= 1;
    if (end < 1) continue;
    const value = values[end] as number;
    let start = end;
    while (start > 0 && values[start - 1] === value) start -= 1;
    const days = end - start + 1;
    if (days > 1)
      runs.push({ pointId, value, days, from: file.dates[start] ?? "", to: file.dates[end] ?? "" });
  }
  return runs;
}
