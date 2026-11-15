/**
 * Stage-wise crop coefficient curve (FAO-56 Chapter 6, "Construction of the Kc curve").
 * Kc is constant in the initial and mid-season stages and varies linearly in the crop development stage
 * (Kc ini to Kc mid) and the late-season stage (Kc mid to Kc end). Eq 66 is printed as an image in the
 * online document; this follows the variables defined in the accompanying text.
 */

export type StageName = 'initial' | 'development' | 'mid' | 'late';
export const STAGE_NAMES: readonly StageName[] = ['initial', 'development', 'mid', 'late'];

export interface KcSpec {
  lengths: Record<StageName, number>;
  kcIni: number;
  kcMid: number;
  kcEnd: number;
}

export function totalDays(spec: KcSpec): number {
  return spec.lengths.initial + spec.lengths.development + spec.lengths.mid + spec.lengths.late;
}

/** 1-based inclusive day ranges of each stage within the season. */
export function stageRanges(spec: KcSpec): Record<StageName, { startDay: number; endDay: number }> {
  const l = spec.lengths;
  const e1 = l.initial;
  const e2 = e1 + l.development;
  const e3 = e2 + l.mid;
  const e4 = e3 + l.late;
  return {
    initial: { startDay: 1, endDay: e1 },
    development: { startDay: e1 + 1, endDay: e2 },
    mid: { startDay: e2 + 1, endDay: e3 },
    late: { startDay: e3 + 1, endDay: e4 },
  };
}

/** Daily Kc for day numbers 1..total; the returned array index 0 is day 1. */
export function dailyKc(spec: KcSpec): number[] {
  const l = spec.lengths;
  const e1 = l.initial;
  const e2 = e1 + l.development;
  const e3 = e2 + l.mid;
  const total = e3 + l.late;
  const out: number[] = new Array<number>(total);
  for (let i = 1; i <= total; i += 1) {
    let kc: number;
    if (i <= e1) kc = spec.kcIni;
    else if (i <= e2) kc = spec.kcIni + ((i - e1) / l.development) * (spec.kcMid - spec.kcIni);
    else if (i <= e3) kc = spec.kcMid;
    else kc = spec.kcMid + ((i - e3) / l.late) * (spec.kcEnd - spec.kcMid);
    out[i - 1] = kc;
  }
  return out;
}
