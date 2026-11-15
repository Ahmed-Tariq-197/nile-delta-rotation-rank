/**
 * Climate loading: validation, unit handling, daily ET0, day-of-year climatology and the stress-year
 * profile. Day of year uses the 365-day calendar: 29 February is excluded.
 */
import { CUMULATIVE_DAYS_BEFORE_MONTH } from './constants.js';
import { et0PenmanMonteith, radiationUnitFactorToMjM2Day } from './fao56.js';
import { ClimateFile, EngineError, Label } from './types.js';

export const REQUIRED_VARIABLES = ['T2M', 'T2M_MAX', 'T2M_MIN', 'RH2M', 'WS2M', 'ALLSKY_SFC_SW_DWN'] as const;
export type RequiredVariable = (typeof REQUIRED_VARIABLES)[number];

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export interface ParsedDate {
  year: number;
  month: number;
  day: number;
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function parseIsoDate(s: string): ParsedDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  const dim = month === 2 && isLeapYear(year) ? 29 : DAYS_IN_MONTH[month - 1]!;
  if (day < 1 || day > dim) return null;
  return { year, month, day };
}

/** Day of year on the 365-day calendar (1..365), or 0 for 29 February. */
export function dayOfYear365(d: ParsedDate): number {
  if (d.month === 2 && d.day === 29) return 0;
  return CUMULATIVE_DAYS_BEFORE_MONTH[d.month - 1]! + d.day;
}

const TEMP_UNITS = new Set(['c', '°c', 'degc', 'celsius', 'degreesc', 'degreescelsius']);
const RH_UNITS = new Set(['%', 'percent', 'pct']);
const WIND_UNITS = new Set(['m/s', 'ms-1', 'm.s-1', 'ms^-1', 'm/sec']);

function normUnit(u: string): string {
  return u.toLowerCase().replace(/[\s^]/g, '');
}

export interface ClimateStats {
  dayCount: number;
  feb29Skipped: number;
  years: number[];
  completeYears: number[];
  stressYear: number;
  et0ValidDays: number;
  et0InvalidDays: number;
  stressTmaxFilledDays: number;
  stressEt0FilledDays: number;
  variableNullCounts: Record<string, number>;
  variableUnits: Record<string, string>;
  variableLabels: Record<string, Label>;
  variableSources: Record<string, string>;
  shortwaveFactorToMj: number;
  start: string;
  end: string;
}

export interface ClimateModel {
  /** Indexed by day of year 1..365; index 0 unused. NaN where no valid value exists. */
  et0Clim: Float64Array;
  tmaxClim: Float64Array;
  et0Stress: Float64Array;
  tmaxStress: Float64Array;
  stats: ClimateStats;
}

export interface PointGeometry {
  latitudeDeg: number;
  elevationM: number;
}

function mean(sum: number, n: number): number {
  return n > 0 ? sum / n : Number.NaN;
}

export function buildClimateModel(file: ClimateFile, geom: PointGeometry): ClimateModel {
  const n = file.dates.length;
  if (n === 0) throw new EngineError('DATA_GAP', `Climate file for ${file.point_id} has no dates.`);
  const vars = {} as Record<RequiredVariable, Array<number | null>>;
  const units: Record<string, string> = {};
  const labels: Record<string, Label> = {};
  const sources: Record<string, string> = {};
  const nullCounts: Record<string, number> = {};
  for (const name of REQUIRED_VARIABLES) {
    const v = file.variables?.[name];
    if (!v) throw new EngineError('DATA_GAP', `Climate file for ${file.point_id} is missing variable ${name}.`);
    if (!Array.isArray(v.values) || v.values.length !== n) {
      throw new EngineError('DATA_GAP', `Variable ${name} has ${Array.isArray(v.values) ? v.values.length : 'no'} values but there are ${n} dates.`);
    }
    let nulls = 0;
    for (let i = 0; i < n; i += 1) {
      const x = v.values[i];
      if (x === null) nulls += 1;
      else if (typeof x !== 'number' || !Number.isFinite(x)) throw new EngineError('DATA_GAP', `Variable ${name} has a non-finite value at index ${i}.`);
      else if (x === -999) throw new EngineError('DATA_GAP', `Variable ${name} contains the sentinel -999 at index ${i}; the bundle must use null.`);
    }
    vars[name] = v.values;
    units[name] = v.unit;
    labels[name] = v.label;
    sources[name] = v.source;
    nullCounts[name] = nulls;
  }
  for (const name of ['T2M', 'T2M_MAX', 'T2M_MIN'] as const) {
    if (!TEMP_UNITS.has(normUnit(units[name]!))) throw new EngineError('DATA_GAP', `Unsupported unit "${units[name]}" for ${name}; expected degrees Celsius.`);
  }
  if (!RH_UNITS.has(normUnit(units.RH2M!))) throw new EngineError('DATA_GAP', `Unsupported unit "${units.RH2M}" for RH2M; expected percent.`);
  if (!WIND_UNITS.has(normUnit(units.WS2M!))) throw new EngineError('DATA_GAP', `Unsupported unit "${units.WS2M}" for WS2M; expected m/s.`);
  const rsFactor = radiationUnitFactorToMjM2Day(units.ALLSKY_SFC_SW_DWN!);
  if (rsFactor === null) {
    throw new EngineError('DATA_GAP', `Unsupported unit "${units.ALLSKY_SFC_SW_DWN}" for ALLSKY_SFC_SW_DWN; expected MJ/m2/day, kWh/m2/day or W/m2.`);
  }

  const years: number[] = new Array<number>(n);
  const doys: number[] = new Array<number>(n);
  const seen = new Set<string>();
  let feb29 = 0;
  for (let i = 0; i < n; i += 1) {
    const ds = file.dates[i]!;
    const p = parseIsoDate(ds);
    if (!p) throw new EngineError('DATA_GAP', `Climate file has an invalid date "${ds}" at index ${i}.`);
    if (seen.has(ds)) throw new EngineError('DATA_GAP', `Climate file has a duplicate date ${ds}.`);
    seen.add(ds);
    years[i] = p.year;
    doys[i] = dayOfYear365(p);
    if (doys[i] === 0) feb29 += 1;
  }

  const et0 = new Float64Array(n).fill(Number.NaN);
  let valid = 0;
  let invalid = 0;
  for (let i = 0; i < n; i += 1) {
    if (doys[i] === 0) continue;
    const t = vars.T2M[i];
    const tx = vars.T2M_MAX[i];
    const tn = vars.T2M_MIN[i];
    const rh = vars.RH2M[i];
    const ws = vars.WS2M[i];
    const sw = vars.ALLSKY_SFC_SW_DWN[i];
    if (t == null || tx == null || tn == null || rh == null || ws == null || sw == null || rh < 0 || rh > 100 || ws < 0 || sw < 0 || tx < tn) {
      invalid += 1;
      continue;
    }
    try {
      const r = et0PenmanMonteith({
        tMeanC: t, tMaxC: tx, tMinC: tn, rhMeanPct: rh, u2MS: ws, rsMjM2Day: sw * rsFactor,
        latitudeDeg: geom.latitudeDeg, elevationM: geom.elevationM, doy: doys[i]!,
      });
      if (Number.isFinite(r.et0MmDay)) {
        et0[i] = r.et0MmDay;
        valid += 1;
      } else invalid += 1;
    } catch {
      invalid += 1;
    }
  }

  const et0Sum = new Float64Array(366);
  const et0Cnt = new Float64Array(366);
  const txSum = new Float64Array(366);
  const txCnt = new Float64Array(366);
  for (let i = 0; i < n; i += 1) {
    const d = doys[i]!;
    if (d === 0) continue;
    if (Number.isFinite(et0[i]!)) {
      et0Sum[d]! += et0[i]!;
      et0Cnt[d]! += 1;
    }
    const tx = vars.T2M_MAX[i];
    if (tx != null) {
      txSum[d]! += tx;
      txCnt[d]! += 1;
    }
  }
  const et0Clim = new Float64Array(366).fill(Number.NaN);
  const tmaxClim = new Float64Array(366).fill(Number.NaN);
  for (let d = 1; d <= 365; d += 1) {
    et0Clim[d] = mean(et0Sum[d]!, et0Cnt[d]!);
    tmaxClim[d] = mean(txSum[d]!, txCnt[d]!);
  }

  const yearDays = new Map<number, Set<number>>();
  for (let i = 0; i < n; i += 1) {
    const d = doys[i]!;
    if (d === 0) continue;
    let s = yearDays.get(years[i]!);
    if (!s) {
      s = new Set<number>();
      yearDays.set(years[i]!, s);
    }
    s.add(d);
  }
  const allYears = [...yearDays.keys()].sort((a, b) => a - b);
  const completeYears = allYears.filter((y) => yearDays.get(y)!.size === 365);
  if (completeYears.length === 0) throw new EngineError('DATA_GAP', 'The climate record has no complete calendar year; a stress-year profile cannot be built.');
  let stressYear = -1;
  let best = Number.NEGATIVE_INFINITY;
  for (const y of completeYears) {
    let s = 0;
    let c = 0;
    for (let i = 0; i < n; i += 1) {
      if (years[i] !== y || doys[i] === 0) continue;
      const tx = vars.T2M_MAX[i];
      if (tx != null) {
        s += tx;
        c += 1;
      }
    }
    if (c === 0) continue;
    const m = s / c;
    if (m > best) {
      best = m;
      stressYear = y;
    }
  }
  if (stressYear < 0) throw new EngineError('DATA_GAP', 'No complete calendar year has valid T2M_MAX values.');
  const tmaxStress = new Float64Array(366).fill(Number.NaN);
  const et0Stress = new Float64Array(366).fill(Number.NaN);
  const tmaxHave = new Uint8Array(366);
  const et0Have = new Uint8Array(366);
  for (let i = 0; i < n; i += 1) {
    if (years[i] !== stressYear || doys[i] === 0) continue;
    const d = doys[i]!;
    const tx = vars.T2M_MAX[i];
    if (tx != null) {
      tmaxStress[d] = tx;
      tmaxHave[d] = 1;
    }
    if (Number.isFinite(et0[i]!)) {
      et0Stress[d] = et0[i]!;
      et0Have[d] = 1;
    }
  }
  let tmaxFilled = 0;
  let et0Filled = 0;
  for (let d = 1; d <= 365; d += 1) {
    if (!tmaxHave[d]) {
      tmaxStress[d] = tmaxClim[d]!;
      tmaxFilled += 1;
    }
    if (!et0Have[d]) {
      et0Stress[d] = et0Clim[d]!;
      et0Filled += 1;
    }
  }

  return {
    et0Clim, tmaxClim, et0Stress, tmaxStress,
    stats: {
      dayCount: n, feb29Skipped: feb29, years: allYears, completeYears, stressYear,
      et0ValidDays: valid, et0InvalidDays: invalid, stressTmaxFilledDays: tmaxFilled, stressEt0FilledDays: et0Filled,
      variableNullCounts: nullCounts, variableUnits: units, variableLabels: labels, variableSources: sources,
      shortwaveFactorToMj: rsFactor, start: file.start, end: file.end,
    },
  };
}
