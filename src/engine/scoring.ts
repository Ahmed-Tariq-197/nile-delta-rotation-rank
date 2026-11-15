/** Normalization, weighted scoring, ranking and exact Pareto dominance. */
import { REPORT_DECIMALS } from './constants.js';

export function round9(x: number): number {
  const f = Math.pow(10, REPORT_DECIMALS);
  const r = Math.round(x * f) / f;
  return Object.is(r, -0) ? 0 : r;
}

/** Min-max normalization over the feasible set; 1 is best. When all values are equal every plan receives 1. */
export function normalizeMinMax(values: readonly number[], lowerIsBetter: boolean): number[] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!(max > min)) return values.map(() => 1);
  return values.map((v) => (lowerIsBetter ? (max - v) / (max - min) : (v - min) / (max - min)));
}

/**
 * Exact pairwise dominance on minimization vectors: a dominates b when a is no worse in every component and
 * strictly better in at least one. Returns, for each vector, whether it is non-dominated.
 */
export function nonDominated(vectors: ReadonlyArray<readonly number[]>): boolean[] {
  const n = vectors.length;
  const out: boolean[] = new Array<boolean>(n).fill(true);
  for (let j = 0; j < n; j += 1) {
    const b = vectors[j]!;
    for (let i = 0; i < n && out[j]; i += 1) {
      if (i === j) continue;
      const a = vectors[i]!;
      let noWorse = true;
      let strictlyBetter = false;
      for (let k = 0; k < a.length; k += 1) {
        if (a[k]! > b[k]!) {
          noWorse = false;
          break;
        }
        if (a[k]! < b[k]!) strictlyBetter = true;
      }
      if (noWorse && strictlyBetter) out[j] = false;
    }
  }
  return out;
}
