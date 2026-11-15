/**
 * evaluate(): validates the request, builds the climate model, tabulates crop seasons, enumerates every
 * season-feasible 3-year plan, scores, ranks and returns the response. Pure and deterministic: no network,
 * no clock, no randomness.
 */
import { buildClimateModel, parseIsoDate } from './climate.js';
import { ENGINE_VERSION, LIMITS } from './constants.js';
import { ParamResolver, uniqueUses } from './config.js';
import { CropSeason, computeCropSeason } from './crops.js';
import { IndicatorValueInput, assemblePlan } from './assemble.js';
import { buildIndicatorContext, computePlanIndicators } from './indicators.js';
import { enumerateSlotSets, planId, satisfiesMaxShare } from './plans.js';
import { evaluatePlanRules, parseRules } from './rules.js';
import { nonDominated, normalizeMinMax, round9 } from './scoring.js';
import { validateRequest } from './validate.js';
import { CROP_IDS, CropId, EngineBundle, EngineError, EngineOptions, EngineResponse, Plan, Slot } from './types.js';

function overlapWarnings(winter: readonly CropSeason[], summer: readonly CropSeason[]): string[] {
  const out: string[] = [];
  for (const w of winter) {
    for (const s of summer) {
      const wEnd = w.sowingDoy + w.totalDays - 1;
      const sStart = s.sowingDoy > w.sowingDoy ? s.sowingDoy : s.sowingDoy + 365;
      const o1 = Math.max(0, wEnd - sStart + 1);
      if (o1 > 0) {
        out.push(`Calendar overlap of ${o1} day(s): winter crop ${w.cropId} (sown day ${w.sowingDoy}, ${w.totalDays} days) ends after summer crop ${s.cropId} is sown (day ${s.sowingDoy}). Slots are evaluated as sequential.`);
      }
      const sEnd = sStart + s.totalDays - 1;
      const nStart = w.sowingDoy + 365 > sStart ? w.sowingDoy + 365 : w.sowingDoy + 730;
      const o2 = Math.max(0, sEnd - nStart + 1);
      if (o2 > 0) {
        out.push(`Calendar overlap of ${o2} day(s): summer crop ${s.cropId} (sown day ${s.sowingDoy}, ${s.totalDays} days) ends after the next winter crop ${w.cropId} is sown (day ${w.sowingDoy}). Slots are evaluated as sequential.`);
      }
    }
  }
  return out;
}

export function evaluate(requestRaw: unknown, bundle: EngineBundle, options: EngineOptions = {}): EngineResponse {
  const request = validateRequest(requestRaw);
  const overrides: Record<string, number> = { ...(options.paramOverrides ?? {}) };

  const point = bundle.points?.points?.find((p) => p.id === request.point_id);
  if (!point) throw new EngineError('UNKNOWN_POINT', `Point "${request.point_id}" is not in the bundle.`);
  const climateFile = bundle.climate?.[point.id];
  if (!climateFile) throw new EngineError('DATA_GAP', `The bundle has no climate file for point "${point.id}".`);
  if (!bundle.config || typeof bundle.config.crops !== 'object' || bundle.config.crops === null) {
    throw new EngineError('DATA_GAP', 'The bundle config has no crops section.');
  }
  if (typeof point.latitude !== 'number' || !Number.isFinite(point.latitude)) {
    throw new EngineError('DATA_GAP', `Point "${point.id}" has no valid latitude.`);
  }

  const resolver = new ParamResolver(bundle.config, overrides);
  resolver.validateOverrides();

  const warnings: string[] = [];
  let elevation = point.elevation_m;
  if (Object.prototype.hasOwnProperty.call(overrides, 'point.elevation_m')) {
    elevation = overrides['point.elevation_m']!;
    warnings.push(`Elevation ${elevation} m comes from paramOverrides (sensitivity analysis only); it is not a bundle value and is graded unresolved.`);
  }
  if (elevation === null || elevation === undefined || !Number.isFinite(elevation)) {
    throw new EngineError('DATA_GAP', `Point "${point.id}" has no elevation_m; FAO-56 pressure and clear-sky radiation need it. Supply paramOverrides["point.elevation_m"] for a sensitivity run.`);
  }
  if (!parseIsoDate(climateFile.end)) throw new EngineError('DATA_GAP', `Climate end date "${climateFile.end}" is not an ISO date.`);

  const climate = buildClimateModel(climateFile, { latitudeDeg: point.latitude, elevationM: elevation });
  const cs = climate.stats;
  if (bundle.manifest?.data?.end_date && bundle.manifest.data.end_date !== climateFile.end) {
    warnings.push(`The manifest end date (${bundle.manifest.data.end_date}) differs from the climate file end date (${climateFile.end}); the climate file end date is reported.`);
  }
  if (cs.completeYears.length < 2) {
    warnings.push('The climate record has fewer than 2 complete calendar years; the climatology equals the stress-year profile and the water demand uplift is not meaningful.');
  }
  if (cs.et0InvalidDays > 0) {
    warnings.push(`ET0 could not be computed on ${cs.et0InvalidDays} day(s) because of missing or implausible inputs; those days are excluded from the climatology.`);
  }
  if (cs.stressTmaxFilledDays > 0 || cs.stressEt0FilledDays > 0) {
    warnings.push(`In the stress-year profile (calendar year ${cs.stressYear}), T2M_MAX was filled from the day-of-year climatology on ${cs.stressTmaxFilledDays} day(s) and ET0 on ${cs.stressEt0FilledDays} day(s) (modeled gap fill).`);
  }

  const configuredIds = (CROP_IDS as readonly string[]).filter((id) => Object.prototype.hasOwnProperty.call(bundle.config.crops, id)) as CropId[];
  if (configuredIds.length === 0) throw new EngineError('DATA_GAP', 'The config defines none of the supported crops.');
  const allowedIds: CropId[] = request.constraints.allowed_crops ?? [...configuredIds];
  const tabulated = new Map<CropId, CropSeason>();
  const failures = new Map<CropId, EngineError>();
  for (const id of [...configuredIds].sort()) {
    try {
      tabulated.set(id, computeCropSeason(id, resolver, climate));
    } catch (e) {
      if (e instanceof EngineError && e.code === 'DATA_GAP') failures.set(id, e);
      else throw e;
    }
  }
  for (const id of allowedIds) {
    if (!configuredIds.includes(id)) throw new EngineError('DATA_GAP', `Allowed crop "${id}" is not defined in the config.`);
    const f = failures.get(id);
    if (f) throw f;
  }
  const allCrops = [...tabulated.values()];

  const cap = request.constraints.seasonal_water_cap_mm;
  const excludedByCap: string[] = [];
  const allowedMap = new Map<CropId, CropSeason>();
  for (const id of [...allowedIds].sort()) {
    const c = tabulated.get(id)!;
    if (cap !== null && c.waterDemandMm > cap) {
      excludedByCap.push(`${id} (${round9(c.waterDemandMm)} mm)`);
      continue;
    }
    allowedMap.set(id, c);
  }
  if (excludedByCap.length > 0) warnings.push(`Crops excluded by seasonal_water_cap_mm = ${cap}: ${excludedByCap.join(', ')}.`);
  const winterCrops = [...allowedMap.values()].filter((c) => c.season === 'winter').map((c) => c.cropId).sort();
  const summerCrops = [...allowedMap.values()].filter((c) => c.season === 'summer').map((c) => c.cropId).sort();
  if (winterCrops.length === 0 || summerCrops.length === 0) {
    throw new EngineError('NO_FEASIBLE_PLAN', `No feasible plan: the allowed crops leave ${winterCrops.length === 0 ? 'no winter crop' : 'no summer crop'} after constraints.`);
  }

  const rules = parseRules(bundle.config.rotation_rules ?? bundle.config.rules, resolver);

  const maxShare = request.constraints.max_share_by_crop;
  let feasible: Slot[][] = enumerateSlotSets(winterCrops, summerCrops, request.horizon_years).filter((slots) => satisfiesMaxShare(slots, maxShare));
  const beforeSeasonRule = feasible.length;
  feasible = feasible.filter((slots) => !evaluatePlanRules(slots, rules, allowedMap).violated);
  if (feasible.length < beforeSeasonRule) {
    warnings.push(`${beforeSeasonRule - feasible.length} plan(s) excluded because a preceding crop cannot finish before the sowing window of the following crop ends (season_constraint rules).`);
  }
  if (feasible.length === 0) throw new EngineError('NO_FEASIBLE_PLAN', 'No plan satisfies the constraints and the rotation rules.');

  const ctx = buildIndicatorContext({
    resolver, allCrops, allowedCrops: allowedMap, cropCountInConfig: configuredIds.length, rules,
    salinityEcDsm: request.soil.salinity_ec_dsm, climate, pointId: point.id,
  });

  const raws = feasible.map((slots) => computePlanIndicators(slots, ctx));
  const water = raws.map((r) => round9(r.waterTotal));
  const soil = raws.map((r) => round9(r.soil));
  const risk = raws.map((r) => round9(r.risk));
  const nWater = normalizeMinMax(water, true).map(round9);
  const nSoil = normalizeMinMax(soil, false).map(round9);
  const nRisk = normalizeMinMax(risk, true).map(round9);
  const pri = request.priorities;
  const scores = nWater.map((_, i) => round9(Math.min(1, Math.max(0, pri.water * nWater[i]! + pri.soil_health * nSoil[i]! + pri.climate_risk * nRisk[i]!))));
  const ids = feasible.map((s) => planId(s));
  const order = feasible.map((_, i) => i).sort((a, b) => (scores[b]! !== scores[a]! ? scores[b]! - scores[a]! : ids[a]! < ids[b]! ? -1 : ids[a]! > ids[b]! ? 1 : 0));
  const rankOf = new Array<number>(feasible.length);
  order.forEach((idx, pos) => {
    rankOf[idx] = pos + 1;
  });
  const front = nonDominated(feasible.map((_, i) => [water[i]!, -soil[i]!, risk[i]!]));

  const plans: Plan[] = order.map((i) => {
    const inputs: IndicatorValueInput = {
      water: { value: water[i]!, normalized: nWater[i]! },
      soil: { value: soil[i]!, normalized: nSoil[i]! },
      risk: { value: risk[i]!, normalized: nRisk[i]! },
    };
    return assemblePlan({ id: ids[i]!, slots: feasible[i]!, raw: raws[i]!, values: inputs, score: scores[i]!, rank: rankOf[i]!, pareto: front[i]! });
  });

  const usedConfig = uniqueUses(raws.flatMap((r) => [...r.refs.water, ...r.refs.soil, ...r.refs.risk]));
  warnings.push(...ctx.notes, ...resolver.notes);
  const cropNotes = new Set<string>();
  for (const c of allowedMap.values()) for (const n of c.notes) cropNotes.add(n);
  warnings.push(...cropNotes);
  warnings.push(...overlapWarnings([...allowedMap.values()].filter((c) => c.season === 'winter'), [...allowedMap.values()].filter((c) => c.season === 'summer')));
  const applied = resolver.overridesApplied;
  if (applied.length > 0) {
    warnings.push(`Parameter overrides are active (sensitivity analysis only): ${applied.join(', ')}. These values are not from the config and are graded unresolved.`);
  }
  const graded = [...usedConfig].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const provList = graded.filter((u) => u.evidence_grade === 'provisional').map((u) => `${u.path} (source ${u.source_id})`);
  const unresList = graded.filter((u) => u.evidence_grade === 'unresolved').map((u) => `${u.path} (source ${u.source_id})`);
  if (provList.length > 0) warnings.push(`Provisional parameters in use (${provList.length}): ${provList.join(', ')}. Results that depend on them are provisional.`);
  if (unresList.length > 0) warnings.push(`Unresolved parameters in use (${unresList.length}): ${unresList.join(', ')}. Results that depend on them are unresolved.`);
  warnings.push('Water demand is gross crop evapotranspiration (plus any configured extra water); rainfall, irrigation efficiency and water-source constraints are not modeled.');

  return {
    engine_version: ENGINE_VERSION,
    bundle_version: bundle.manifest?.bundle_version ?? bundle.points.bundle_version,
    data_end_date: climateFile.end,
    request,
    plans,
    pareto_front_ids: plans.filter((p) => p.pareto).map((p) => p.id),
    top_ids: plans.slice(0, 3).map((p) => p.id),
    warnings: [...new Set(warnings)],
    limits: [...LIMITS],
  };
}
