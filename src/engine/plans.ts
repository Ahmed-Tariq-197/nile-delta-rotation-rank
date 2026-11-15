/** Plan enumeration and constraint filtering. */
import { SHARE_EPSILON } from './constants.js';
import { CropId, Season, Slot } from './types.js';

export function slotKey(season: Season, crop: CropId): string {
  return `${season === 'winter' ? 'w' : 's'}-${crop}`;
}

export function planId(slots: readonly Slot[]): string {
  return slots.map((s) => slotKey(s.season, s.crop_id)).join('|');
}

/** Enumerates every season-feasible plan: a winter crop then a summer crop in each year, in deterministic order. */
export function enumerateSlotSets(winterCrops: readonly CropId[], summerCrops: readonly CropId[], years: number): Slot[][] {
  const pattern: Season[] = [];
  for (let y = 1; y <= years; y += 1) pattern.push('winter', 'summer');
  const out: Slot[][] = [];
  const current: Slot[] = [];
  const recurse = (pos: number): void => {
    if (pos === pattern.length) {
      out.push(current.map((s) => ({ ...s })));
      return;
    }
    const season = pattern[pos]!;
    const year = (Math.floor(pos / 2) + 1) as 1 | 2 | 3;
    for (const crop of season === 'winter' ? winterCrops : summerCrops) {
      current.push({ year, season, crop_id: crop });
      recurse(pos + 1);
      current.pop();
    }
  };
  recurse(0);
  return out;
}

/** True when every crop's share of the slots is within its maximum. */
export function satisfiesMaxShare(slots: readonly Slot[], maxShare: Partial<Record<CropId, number>> | null): boolean {
  if (!maxShare) return true;
  const counts = new Map<CropId, number>();
  for (const s of slots) counts.set(s.crop_id, (counts.get(s.crop_id) ?? 0) + 1);
  for (const [crop, n] of counts) {
    const cap = maxShare[crop];
    if (cap !== undefined && n / slots.length > cap + SHARE_EPSILON) return false;
  }
  return true;
}
