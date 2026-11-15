/**
 * Plan-level indicators: water demand, soil health index, climate risk index.
 * Soil health components follow the four proxies defined in the science memo (legume nitrogen input, repetition
 * pressure, salinity exposure, crop diversity). Every coefficient comes from the config (with grades); engine
 * defaults are graded provisional and reported.
 */
import { ClimateModel } from './climate.js';
import { ParamResolver, ParamUse, SOURCE_ENGINE_DEFAULT, uniqueUses } from './config.js';
import { CropSeason, relativeYieldReductionPct } from './crops.js';
import { RuleSet, evaluatePlanRules } from './rules.js';
import { CropId, Driver, EngineError, ProvenanceEntry, Slot, SlotDetail } from './types.js';

type SoilComponent = 'legume_n' | 'repetition' | 'salinity' | 'diversity';
type RiskComponent = 'heat' | 'water_uplift';

export interface IndicatorContext {
  crops: ReadonlyMap<CropId, CropSeason>;
  cropCountInConfig: number;
  rules: RuleSet;
  salinityEcDsm: number | null;
  legumeActive: boolean;
  maxCreditKgNHa: number;
  repetitionActive: boolean;
  salinityActive: boolean;
  soilWeights: Record<SoilComponent, number>;
  soilWeightUses: ParamUse[];
  riskWeights: Record<RiskComponent, number>;
  riskWeightUses: ParamUse[];
  upliftScale: number;
  upliftScaleUses: ParamUse[];
  dataRefs: { et0: ProvenanceEntry[]; request: ProvenanceEntry[] };
  notes: string[];
}

export interface RawPlanIndicators {
  slotDetails: SlotDetail[];
  waterTotal: number;
  waterDrivers: Driver[];
  soil: number;
  soilDrivers: Driver[];
  risk: number;
  riskDrivers: Driver[];
  violated: boolean;
  refs: { water: ParamUse[]; soil: ParamUse[]; risk: ParamUse[] };
  dataRefs: { water: ProvenanceEntry[]; soil: ProvenanceEntry[]; risk: ProvenanceEntry[] };
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function defaultUse(path: string, label: 'assumed' | 'modeled'): ParamUse {
  return { path, label, evidence_grade: 'provisional', source_id: SOURCE_ENGINE_DEFAULT };
}

export interface BuildContextInput {
  resolver: ParamResolver;
  allCrops: readonly CropSeason[];
  allowedCrops: ReadonlyMap<CropId, CropSeason>;
  cropCountInConfig: number;
  rules: RuleSet;
  salinityEcDsm: number | null;
  climate: ClimateModel;
  pointId: string;
}

export function buildIndicatorContext(input: BuildContextInput): IndicatorContext {
  const { resolver, allCrops, allowedCrops, rules } = input;
  const notes: string[] = [];
  const allowed = [...allowedCrops.values()];

  const salinityActive = input.salinityEcDsm !== null && allowed.length > 0 && allowed.every((c) => c.salinity !== null);
  if (input.salinityEcDsm === null) {
    notes.push('Salinity was not provided (soil.salinity_ec_dsm is null); salinity yield reduction is null and the salinity component is omitted from the soil health index.');
  } else if (!salinityActive) {
    notes.push('Salinity component omitted: at least one allowed crop has no salinity threshold and slope in the config; relative_yield_reduction_pct is null for those crops.');
  }
  const legumeActive = rules.credits.length > 0;
  if (!legumeActive) notes.push('Legume nitrogen component omitted from the soil health index: the config has no usable n_credit rule.');
  const repetitionActive = rules.repetitions.length > 0;
  if (!repetitionActive) notes.push('Repetition component omitted from the soil health index: the config has no usable repetition_penalty rule.');
  if (rules.unusedIds.length > 0) {
    notes.push(`Previous-crop-effect rules are read but not used in version 1 (the config says to apply at most one of the N credit and a previous-crop benefit): ${rules.unusedIds.join(', ')}.`);
  }

  const soilKeys: SoilComponent[] = ['legume_n', 'repetition', 'salinity', 'diversity'];
  const activeSoil: Record<SoilComponent, boolean> = { legume_n: legumeActive, repetition: repetitionActive, salinity: salinityActive, diversity: true };
  const soilWeights: Record<SoilComponent, number> = { legume_n: 0, repetition: 0, salinity: 0, diversity: 0 };
  const soilWeightUses: ParamUse[] = [];
  if (resolver.has('soil_health.weights')) {
    for (const k of soilKeys) {
      if (!activeSoil[k]) continue;
      const p = resolver.num(`soil_health.weights.${k}`);
      if (!p) throw new EngineError('DATA_GAP', `Config defines soil_health.weights but is missing soil_health.weights.${k}.`);
      if (p.value < 0) throw new EngineError('DATA_GAP', `Config parameter ${p.path} must not be negative.`);
      soilWeights[k] = p.value;
      soilWeightUses.push(p);
    }
  } else {
    for (const k of soilKeys) soilWeights[k] = activeSoil[k] ? 1 : 0;
    soilWeightUses.push(defaultUse('soil_health.weights', 'assumed'));
    notes.push('soil_health.weights is not defined in the config; equal weights are used over the active components (provisional engine default).');
  }
  if (!(soilKeys.reduce((s, k) => s + soilWeights[k], 0) > 0)) throw new EngineError('DATA_GAP', 'The soil health component weights sum to zero.');

  const riskKeys: RiskComponent[] = ['heat', 'water_uplift'];
  const riskWeights: Record<RiskComponent, number> = { heat: 0, water_uplift: 0 };
  const riskWeightUses: ParamUse[] = [];
  if (resolver.has('climate_risk.weights')) {
    for (const k of riskKeys) {
      const p = resolver.num(`climate_risk.weights.${k}`);
      if (!p) throw new EngineError('DATA_GAP', `Config defines climate_risk.weights but is missing climate_risk.weights.${k}.`);
      if (p.value < 0) throw new EngineError('DATA_GAP', `Config parameter ${p.path} must not be negative.`);
      riskWeights[k] = p.value;
      riskWeightUses.push(p);
    }
  } else {
    riskWeights.heat = 1;
    riskWeights.water_uplift = 1;
    riskWeightUses.push(defaultUse('climate_risk.weights', 'assumed'));
    notes.push('climate_risk.weights is not defined in the config; equal weights are used (provisional engine default).');
  }
  if (!(riskWeights.heat + riskWeights.water_uplift > 0)) throw new EngineError('DATA_GAP', 'The climate risk component weights sum to zero.');

  let upliftScale: number;
  const upliftScaleUses: ParamUse[] = [];
  const scaleParam = resolver.num('climate_risk.uplift_scale_max');
  if (scaleParam) {
    if (!(scaleParam.value > 0)) throw new EngineError('DATA_GAP', `Config parameter ${scaleParam.path} must be positive.`);
    upliftScale = scaleParam.value;
    upliftScaleUses.push(scaleParam);
  } else {
    const maxUplift = Math.max(0, ...allCrops.map((c) => c.upliftRatio));
    upliftScale = maxUplift > 0 ? maxUplift : 1;
    upliftScaleUses.push(defaultUse('climate_risk.uplift_scale_max', 'modeled'));
    for (const c of allCrops) upliftScaleUses.push(...c.refs.water);
    notes.push('climate_risk.uplift_scale_max is not defined in the config; the scale is the largest positive stress-year uplift among all configured crops (provisional engine default, data-derived).');
  }

  const s = input.climate.stats;
  const et0: ProvenanceEntry[] = (['T2M', 'T2M_MAX', 'T2M_MIN', 'RH2M', 'WS2M', 'ALLSKY_SFC_SW_DWN'] as const).map((v) => ({
    kind: 'data' as const,
    ref: `climate/${input.pointId}.json#${v} (unit label: ${s.variableUnits[v]})`,
    label: s.variableLabels[v]!,
  }));
  et0.push(
    { kind: 'data', ref: 'derived:et0_fao56_penman_monteith_daily', label: 'modeled' },
    { kind: 'data', ref: 'derived:day_of_year_climatology', label: 'modeled' },
    { kind: 'data', ref: `derived:stress_year_profile (calendar year ${s.stressYear})`, label: 'modeled' },
    { kind: 'data', ref: 'point.latitude_and_elevation (points.json)', label: 'observed' },
  );
  const request: ProvenanceEntry[] = salinityActive ? [{ kind: 'data', ref: 'request.soil.salinity_ec_dsm', label: 'assumed' }] : [];

  return {
    crops: allowedCrops, cropCountInConfig: input.cropCountInConfig, rules, salinityEcDsm: input.salinityEcDsm,
    legumeActive, maxCreditKgNHa: Math.max(0, ...rules.credits.map((c) => c.valueKgNHa)),
    repetitionActive, salinityActive, soilWeights, soilWeightUses, riskWeights, riskWeightUses,
    upliftScale, upliftScaleUses: uniqueUses(upliftScaleUses), dataRefs: { et0, request }, notes,
  };
}

function sharesFrom(map: Map<string, number>): Driver[] {
  let total = 0;
  for (const v of map.values()) total += v;
  const out: Driver[] = [];
  for (const [label, v] of map) out.push({ label, share: total > 0 ? v / total : 0 });
  out.sort((a, b) => (b.share !== a.share ? b.share - a.share : a.label < b.label ? -1 : a.label > b.label ? 1 : 0));
  return out;
}

export function computePlanIndicators(slots: readonly Slot[], ctx: IndicatorContext): RawPlanIndicators {
  const cropOf = (id: CropId): CropSeason => {
    const c = ctx.crops.get(id);
    if (!c) throw new EngineError('DATA_GAP', `Internal error: crop ${id} was not tabulated.`);
    return c;
  };
  const planCrops = [...new Set(slots.map((s) => s.crop_id))].map(cropOf);
  const rr = evaluatePlanRules(slots, ctx.rules, ctx.crops);

  const slotDetails: SlotDetail[] = slots.map((s, k) => {
    const c = cropOf(s.crop_id);
    let yieldRed: number | null = null;
    if (ctx.salinityEcDsm !== null && c.salinity !== null) {
      yieldRed = relativeYieldReductionPct(ctx.salinityEcDsm, c.salinity.thresholdEcDsm, c.salinity.slopePctPerDsm);
    }
    return {
      year: s.year, season: s.season, crop_id: s.crop_id, water_demand_mm: c.waterDemandMm,
      n_balance_kg_ha: ctx.legumeActive ? rr.creditBySlot[k]! : null,
      relative_yield_reduction_pct: yieldRed,
    };
  });
  let waterTotal = 0;
  const waterByCrop = new Map<string, number>();
  for (const d of slotDetails) {
    waterTotal += d.water_demand_mm;
    waterByCrop.set(d.crop_id, (waterByCrop.get(d.crop_id) ?? 0) + d.water_demand_mm);
  }

  const comps: Array<{ key: SoilComponent; value: number }> = [];
  if (ctx.legumeActive) {
    const winterSlots = slots.length / 2;
    const credit = rr.creditBySlot.reduce((a, b) => a + b, 0);
    comps.push({ key: 'legume_n', value: ctx.maxCreditKgNHa > 0 ? clamp01(credit / (winterSlots * ctx.maxCreditKgNHa)) : 0 });
  }
  if (ctx.repetitionActive) comps.push({ key: 'repetition', value: clamp01(1 - rr.repetitionMean) });
  if (ctx.salinityActive) {
    let sum = 0;
    for (const d of slotDetails) sum += d.relative_yield_reduction_pct as number;
    comps.push({ key: 'salinity', value: clamp01(1 - sum / slotDetails.length / 100) });
  }
  const distinct = new Set(slots.map((s) => s.crop_id)).size;
  comps.push({ key: 'diversity', value: clamp01(distinct / Math.min(slots.length, ctx.cropCountInConfig)) });
  let wSum = 0;
  let wcSum = 0;
  const soilContrib = new Map<string, number>();
  for (const c of comps) {
    const w = ctx.soilWeights[c.key];
    wSum += w;
    wcSum += w * c.value;
    soilContrib.set(c.key, w * c.value);
  }
  const soil = wSum > 0 ? wcSum / wSum : 0;

  let riskSum = 0;
  const riskContrib = new Map<string, number>([['heat_exposure', 0], ['water_demand_uplift', 0]]);
  for (const s of slots) {
    const c = cropOf(s.crop_id);
    const wHeat = c.heat ? ctx.riskWeights.heat : 0;
    const wUp = ctx.riskWeights.water_uplift;
    const wTot = wHeat + wUp;
    const heatComp = c.heat ? c.heat.fraction : 0;
    const upComp = clamp01(Math.max(0, c.upliftRatio) / ctx.upliftScale);
    if (wTot > 0) {
      const heatPart = (wHeat * heatComp) / wTot;
      const upPart = (wUp * upComp) / wTot;
      riskSum += heatPart + upPart;
      riskContrib.set('heat_exposure', riskContrib.get('heat_exposure')! + heatPart);
      riskContrib.set('water_demand_uplift', riskContrib.get('water_demand_uplift')! + upPart);
    }
  }
  const risk = riskSum / slots.length;

  const waterUses = uniqueUses(planCrops.flatMap((c) => c.refs.water));
  const soilUses = uniqueUses([
    ...(ctx.salinityActive ? planCrops.flatMap((c) => c.refs.salinity) : []),
    ...(ctx.legumeActive ? ctx.rules.credits.map((c) => c.use) : []),
    ...ctx.soilWeightUses,
    ...rr.fired,
  ]);
  const riskUses = uniqueUses([
    ...planCrops.flatMap((c) => c.refs.heat),
    ...planCrops.flatMap((c) => c.refs.water),
    ...ctx.riskWeightUses,
    ...ctx.upliftScaleUses,
  ]);

  return {
    slotDetails, waterTotal, waterDrivers: sharesFrom(waterByCrop), soil, soilDrivers: sharesFrom(soilContrib),
    risk, riskDrivers: sharesFrom(riskContrib), violated: rr.violated,
    refs: { water: waterUses, soil: soilUses, risk: riskUses },
    dataRefs: { water: ctx.dataRefs.et0, soil: ctx.dataRefs.request, risk: ctx.dataRefs.et0 },
  };
}
