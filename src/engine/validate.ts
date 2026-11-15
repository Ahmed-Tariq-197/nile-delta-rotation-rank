/** Request validation and response contract validation. */
import { SHARE_EPSILON } from './constants.js';
import { CROP_IDS, CropId, EVIDENCE_GRADES, EngineError, EngineRequest, LABELS, SEASONS, ValidationResult } from './types.js';

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x);
}

function fail(msg: string): never {
  throw new EngineError('INVALID_REQUEST', msg);
}

/** Validates a request and returns a normalized copy: priorities sum to 1, allowed crops are unique and sorted. */
export function validateRequest(raw: unknown): EngineRequest {
  if (!isObject(raw)) fail('The request must be an object.');
  if (typeof raw.point_id !== 'string' || raw.point_id.length === 0) fail('point_id must be a non-empty string.');
  if (raw.horizon_years !== 3) fail('horizon_years must be 3 in version 1.');
  const pr = raw.priorities;
  if (!isObject(pr)) fail('priorities must be an object.');
  for (const k of ['water', 'soil_health', 'climate_risk'] as const) {
    const v = pr[k];
    if (!isFiniteNumber(v) || v < 0 || v > 1) fail(`priorities.${k} must be a number within 0..1.`);
  }
  const w = pr.water as number;
  const s = pr.soil_health as number;
  const c = pr.climate_risk as number;
  const sum = w + s + c;
  if (!(sum > 0)) fail('At least one priority must be greater than 0.');

  const soil = raw.soil;
  if (!isObject(soil)) fail('soil must be an object.');
  const ec = soil.salinity_ec_dsm;
  if (ec !== null && (!isFiniteNumber(ec) || ec < 0)) fail('soil.salinity_ec_dsm must be a non-negative number or null.');

  const con = raw.constraints;
  if (!isObject(con)) fail('constraints must be an object.');
  let allowed: CropId[] | null = null;
  if (con.allowed_crops !== null) {
    if (!Array.isArray(con.allowed_crops) || con.allowed_crops.length === 0) fail('constraints.allowed_crops must be a non-empty array or null.');
    for (const a of con.allowed_crops) {
      if (!(CROP_IDS as readonly unknown[]).includes(a)) fail(`constraints.allowed_crops contains an unknown crop_id: ${String(a)}.`);
    }
    allowed = [...new Set(con.allowed_crops as CropId[])].sort();
  }
  let maxShare: Partial<Record<CropId, number>> | null = null;
  if (con.max_share_by_crop !== null) {
    if (!isObject(con.max_share_by_crop)) fail('constraints.max_share_by_crop must be an object or null.');
    maxShare = {};
    for (const k of Object.keys(con.max_share_by_crop).sort()) {
      if (!(CROP_IDS as readonly string[]).includes(k)) fail(`constraints.max_share_by_crop contains an unknown crop_id: ${k}.`);
      const v = con.max_share_by_crop[k];
      if (!isFiniteNumber(v) || v < 0 || v > 1) fail(`constraints.max_share_by_crop.${k} must be a number within 0..1.`);
      maxShare[k as CropId] = v;
    }
  }
  const cap = con.seasonal_water_cap_mm;
  if (cap !== null && (!isFiniteNumber(cap) || cap <= 0)) fail('constraints.seasonal_water_cap_mm must be a positive number or null.');

  return {
    point_id: raw.point_id,
    horizon_years: 3,
    priorities: { water: w / sum, soil_health: s / sum, climate_risk: c / sum },
    soil: { salinity_ec_dsm: ec as number | null },
    constraints: { allowed_crops: allowed, max_share_by_crop: maxShare, seasonal_water_cap_mm: cap as number | null },
  };
}

const INDICATOR_KEYS = ['water_demand_mm_total', 'soil_health_index', 'climate_risk_index'] as const;

/** Checks an engine response against contract v1. */
export function validateResponse(response: unknown): ValidationResult {
  const errors: string[] = [];
  const err = (m: string): void => {
    errors.push(m);
  };
  if (!isObject(response)) return { ok: false, errors: ['The response must be an object.'] };
  const r = response;
  for (const k of ['engine_version', 'bundle_version', 'data_end_date'] as const) {
    if (typeof r[k] !== 'string' || (r[k] as string).length === 0) err(`${k} must be a non-empty string.`);
  }
  if (typeof r.data_end_date === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(r.data_end_date)) err('data_end_date must be YYYY-MM-DD.');
  if (!isObject(r.request)) err('request must be an object.');
  for (const k of ['plans', 'pareto_front_ids', 'top_ids', 'warnings', 'limits'] as const) {
    if (!Array.isArray(r[k])) err(`${k} must be an array.`);
  }
  if (errors.length > 0) return { ok: false, errors };

  const plans = r.plans as unknown[];
  const front = r.pareto_front_ids as unknown[];
  const top = r.top_ids as unknown[];
  for (const k of ['pareto_front_ids', 'top_ids', 'warnings', 'limits'] as const) {
    if ((r[k] as unknown[]).some((x) => typeof x !== 'string')) err(`${k} must contain only strings.`);
  }
  if ((r.limits as unknown[]).length === 0) err('limits must not be empty.');
  if (top.length > 3) err('top_ids must contain at most 3 ids.');
  if (plans.length === 0) err('plans must not be empty.');

  const ids = new Set<string>();
  const ranks: number[] = [];
  const paretoFlags = new Map<string, boolean>();

  const checkNumber = (path: string, v: unknown, lo?: number, hi?: number): void => {
    if (!isFiniteNumber(v)) {
      err(`${path} must be a finite number.`);
      return;
    }
    if (lo !== undefined && v < lo) err(`${path} must be >= ${lo}.`);
    if (hi !== undefined && v > hi) err(`${path} must be <= ${hi}.`);
  };

  plans.forEach((p, pi) => {
    const at = `plans[${pi}]`;
    if (!isObject(p)) {
      err(`${at} must be an object.`);
      return;
    }
    if (typeof p.id !== 'string') {
      err(`${at}.id must be a string.`);
      return;
    }
    if (ids.has(p.id)) err(`${at}.id duplicates another plan id.`);
    ids.add(p.id);
    if (!Array.isArray(p.slots) || p.slots.length !== 6) {
      err(`${at}.slots must have 6 entries.`);
    } else {
      const parts: string[] = [];
      p.slots.forEach((s: unknown, si: number) => {
        if (!isObject(s)) {
          err(`${at}.slots[${si}] must be an object.`);
          return;
        }
        const expYear = Math.floor(si / 2) + 1;
        const expSeason = si % 2 === 0 ? 'winter' : 'summer';
        if (s.year !== expYear) err(`${at}.slots[${si}].year must be ${expYear}.`);
        if (s.season !== expSeason) err(`${at}.slots[${si}].season must be ${expSeason}.`);
        if (!(CROP_IDS as readonly unknown[]).includes(s.crop_id)) err(`${at}.slots[${si}].crop_id is not a valid crop_id.`);
        if (!(SEASONS as readonly unknown[]).includes(s.season)) err(`${at}.slots[${si}].season is not a valid season.`);
        parts.push(`${s.season === 'winter' ? 'w' : 's'}-${String(s.crop_id)}`);
      });
      if (parts.join('|') !== p.id) err(`${at}.id does not match its slots.`);
    }
    if (!Array.isArray(p.slot_details) || p.slot_details.length !== 6) {
      err(`${at}.slot_details must have 6 entries.`);
    } else {
      p.slot_details.forEach((d: unknown, di: number) => {
        if (!isObject(d)) {
          err(`${at}.slot_details[${di}] must be an object.`);
          return;
        }
        const slot = Array.isArray(p.slots) ? (p.slots[di] as Record<string, unknown> | undefined) : undefined;
        if (slot && (d.year !== slot.year || d.season !== slot.season || d.crop_id !== slot.crop_id)) err(`${at}.slot_details[${di}] does not match slots[${di}].`);
        checkNumber(`${at}.slot_details[${di}].water_demand_mm`, d.water_demand_mm, 0);
        if (d.n_balance_kg_ha !== null) checkNumber(`${at}.slot_details[${di}].n_balance_kg_ha`, d.n_balance_kg_ha);
        if (d.relative_yield_reduction_pct !== null) checkNumber(`${at}.slot_details[${di}].relative_yield_reduction_pct`, d.relative_yield_reduction_pct, 0, 100);
      });
    }
    if (!isObject(p.indicators)) {
      err(`${at}.indicators must be an object.`);
    } else {
      for (const k of INDICATOR_KEYS) {
        const iv = p.indicators[k];
        const ip = `${at}.indicators.${k}`;
        if (!isObject(iv)) {
          err(`${ip} must be an object.`);
          continue;
        }
        checkNumber(`${ip}.value`, iv.value);
        if (typeof iv.unit !== 'string' || iv.unit.length === 0) err(`${ip}.unit must be a non-empty string.`);
        checkNumber(`${ip}.normalized`, iv.normalized, 0, 1);
        if (iv.uncertainty !== null && (!isObject(iv.uncertainty) || !isFiniteNumber(iv.uncertainty.low) || !isFiniteNumber(iv.uncertainty.high))) {
          err(`${ip}.uncertainty must be null or { low, high } with finite numbers.`);
        }
        if (!(EVIDENCE_GRADES as readonly unknown[]).includes(iv.weakest_grade)) err(`${ip}.weakest_grade is not a valid evidence grade.`);
        if (!Array.isArray(iv.drivers)) err(`${ip}.drivers must be an array.`);
        else {
          iv.drivers.forEach((dr: unknown, i: number) => {
            if (!isObject(dr) || typeof dr.label !== 'string') err(`${ip}.drivers[${i}].label must be a string.`);
            else checkNumber(`${ip}.drivers[${i}].share`, dr.share, 0, 1);
          });
        }
      }
      const soil = p.indicators.soil_health_index;
      const risk = p.indicators.climate_risk_index;
      const water = p.indicators.water_demand_mm_total;
      if (isObject(soil)) checkNumber(`${at}.indicators.soil_health_index.value`, soil.value, 0, 1);
      if (isObject(risk)) checkNumber(`${at}.indicators.climate_risk_index.value`, risk.value, 0, 1);
      if (isObject(water)) checkNumber(`${at}.indicators.water_demand_mm_total.value`, water.value, 0);
    }
    checkNumber(`${at}.score`, p.score, 0, 1);
    if (!Number.isInteger(p.rank) || (p.rank as number) < 1) err(`${at}.rank must be an integer >= 1.`);
    else ranks.push(p.rank as number);
    if (typeof p.pareto !== 'boolean') err(`${at}.pareto must be a boolean.`);
    else paretoFlags.set(p.id, p.pareto);
    let provisional = 0;
    let unresolved = 0;
    let weakest = 'verified';
    if (!Array.isArray(p.provenance)) {
      err(`${at}.provenance must be an array.`);
    } else {
      p.provenance.forEach((e: unknown, ei: number) => {
        const ep = `${at}.provenance[${ei}]`;
        if (!isObject(e)) {
          err(`${ep} must be an object.`);
          return;
        }
        if (e.kind !== 'data' && e.kind !== 'config') err(`${ep}.kind must be "data" or "config".`);
        if (typeof e.ref !== 'string' || e.ref.length === 0) err(`${ep}.ref must be a non-empty string.`);
        if (!(LABELS as readonly unknown[]).includes(e.label)) err(`${ep}.label must be observed, modeled or assumed.`);
        if (e.kind === 'config') {
          if (!(EVIDENCE_GRADES as readonly unknown[]).includes(e.evidence_grade)) err(`${ep}.evidence_grade is required for config entries.`);
          if (typeof e.source_id !== 'string' || e.source_id.length === 0) err(`${ep}.source_id is required for config entries.`);
          if (e.evidence_grade === 'provisional') provisional += 1;
          if (e.evidence_grade === 'unresolved') unresolved += 1;
          if (e.evidence_grade === 'unresolved') weakest = 'unresolved';
          else if (e.evidence_grade === 'provisional' && weakest === 'verified') weakest = 'provisional';
        } else if (e.kind === 'data' && ('evidence_grade' in e || 'source_id' in e)) {
          err(`${ep} is a data entry and must not carry evidence_grade or source_id.`);
        }
      });
    }
    if (!isObject(p.evidence)) {
      err(`${at}.evidence must be an object.`);
    } else {
      if (!(EVIDENCE_GRADES as readonly unknown[]).includes(p.evidence.weakest_grade)) err(`${at}.evidence.weakest_grade is invalid.`);
      if (p.evidence.provisional_count !== provisional) err(`${at}.evidence.provisional_count does not match provenance.`);
      if (p.evidence.unresolved_count !== unresolved) err(`${at}.evidence.unresolved_count does not match provenance.`);
      if (p.evidence.weakest_grade !== weakest) err(`${at}.evidence.weakest_grade does not match provenance.`);
    }
  });

  const sorted = [...ranks].sort((a, b) => a - b);
  if (sorted.length === plans.length && sorted.some((v, i) => v !== i + 1)) err('plan ranks must be the integers 1..N without gaps or duplicates.');
  for (let i = 1; i < plans.length; i += 1) {
    const a = plans[i - 1] as Record<string, unknown>;
    const b = plans[i] as Record<string, unknown>;
    if (isFiniteNumber(a.rank) && isFiniteNumber(b.rank) && a.rank > b.rank) {
      err('plans must be ordered by rank.');
      break;
    }
  }
  const expectedTop = plans.slice(0, 3).map((p) => (isObject(p) ? p.id : undefined));
  if (top.length !== expectedTop.length || top.some((id, i) => id !== expectedTop[i])) err('top_ids must be the first (at most 3) plan ids by rank.');
  for (const id of top) if (!ids.has(id as string)) err(`top_ids contains an unknown id: ${String(id)}.`);
  for (const id of front) {
    if (!ids.has(id as string)) err(`pareto_front_ids contains an unknown id: ${String(id)}.`);
    else if (paretoFlags.get(id as string) !== true) err(`Plan ${String(id)} is listed in pareto_front_ids but its pareto flag is not true.`);
  }
  for (const [id, flag] of paretoFlags) if (flag && !front.includes(id)) err(`Plan ${id} has pareto=true but is not listed in pareto_front_ids.`);
  for (let i = 1; i < plans.length; i += 1) {
    const a = plans[i - 1] as Record<string, unknown>;
    const b = plans[i] as Record<string, unknown>;
    if (isFiniteNumber(a.score) && isFiniteNumber(b.score) && a.score + SHARE_EPSILON < b.score) {
      err('plans must be ordered by non-increasing score.');
      break;
    }
  }
  return { ok: errors.length === 0, errors };
}
