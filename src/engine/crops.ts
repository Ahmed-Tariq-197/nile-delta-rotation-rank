/**
 * Per crop-season quantities, computed once per crop (the climatology and stress profile are cyclic by day
 * of year, so they do not depend on the plan year).
 *
 * Config layout read (agronomy config schema v1.1), all under crops.<crop_id>:
 *   season, legume, sowing_window.{start_md,end_md} (MM-DD), season_length_days,
 *   stage_days.{ini,dev,mid,late}, kc.{ini,mid,end}, extra_water_mm,
 *   heat_stress.{threshold_c,sensitive_stage}, n_removal_kg_ha (read, not used in v1),
 *   salinity.{threshold_ds_m,slope_pct_per_ds_m}
 */
import { ClimateModel } from './climate.js';
import { CUMULATIVE_DAYS_BEFORE_MONTH } from './constants.js';
import { ParamResolver, ParamUse, SOURCE_ENGINE_DEFAULT, uniqueUses } from './config.js';
import { KcSpec, STAGE_NAMES, StageName, dailyKc, stageRanges, totalDays } from './kc.js';
import { CropId, EngineError, Season, SEASONS } from './types.js';

export interface HeatResult {
  stage: StageName;
  thresholdC: number;
  stageDays: number;
  exposureDays: number;
  fraction: number;
}

export interface CropSeason {
  cropId: CropId;
  season: Season;
  legume: boolean;
  sowingStartDoy: number;
  sowingEndDoy: number;
  /** Sowing day used for the season: midpoint of the sowing window (R3-D18). */
  sowingDoy: number;
  totalDays: number;
  etcClimMm: number;
  etcStressMm: number;
  extraWaterMm: number;
  waterDemandMm: number;
  upliftRatio: number;
  heat: HeatResult | null;
  salinity: { thresholdEcDsm: number; slopePctPerDsm: number } | null;
  refs: { water: ParamUse[]; heat: ParamUse[]; salinity: ParamUse[] };
  notes: string[];
}

/** Parses "MM-DD" into a day of year on the 365-day calendar. */
export function mdToDoy(md: string): number | null {
  const m = /^(\d{2})-(\d{2})$/.exec(md);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return CUMULATIVE_DAYS_BEFORE_MONTH[month - 1]! + day;
}

/**
 * Maps the free-text sensitive stage of the config to a model stage (R3-D19). Every sensitive stage in the
 * agronomy config (anthesis and grain filling, flowering and boll set, silking and pollination, flowering)
 * is a reproductive phase, which is modeled as the mid-season stage. An exact stage name is also accepted.
 */
export function mapSensitiveStage(text: string): StageName | null {
  const t = text.trim().toLowerCase();
  if ((STAGE_NAMES as readonly string[]).includes(t)) return t as StageName;
  const short: Record<string, StageName> = { ini: 'initial', dev: 'development', mid: 'mid', late: 'late' };
  if (short[t]) return short[t]!;
  if (/(anthesis|flower|silking|pollination|boll|grain fill|heading|tassel)/.test(t)) return 'mid';
  return null;
}

export const HEAT_MAPPING_USE_PATH = 'engine.heat_sensitive_stage_mapping';

export function computeCropSeason(cropId: CropId, resolver: ParamResolver, climate: ClimateModel): CropSeason {
  const base = `crops.${cropId}`;
  const seasonStr = resolver.structuralString(`${base}.season`);
  if (!seasonStr || !(SEASONS as readonly string[]).includes(seasonStr)) {
    throw new EngineError('DATA_GAP', `Config crop ${cropId} has no valid season (expected winter or summer).`);
  }
  const season = seasonStr as Season;
  const legume = resolver.walk(`${base}.legume`) === true;
  const notes: string[] = [];

  const startP = resolver.str(`${base}.sowing_window.start_md`);
  const endP = resolver.str(`${base}.sowing_window.end_md`);
  if (!startP || !endP) throw new EngineError('DATA_GAP', `Config is missing ${base}.sowing_window.start_md or end_md.`);
  const startDoy = mdToDoy(startP.value);
  const endDoy = mdToDoy(endP.value);
  if (startDoy === null || endDoy === null) throw new EngineError('DATA_GAP', `Config sowing window of ${cropId} must use MM-DD dates.`);
  const endAdj = endDoy >= startDoy ? endDoy : endDoy + 365;
  const sowingDoy = ((Math.round((startDoy + endAdj) / 2) - 1) % 365) + 1;

  const sIni = resolver.needNum(`${base}.stage_days.ini`);
  const sDev = resolver.needNum(`${base}.stage_days.dev`);
  const sMid = resolver.needNum(`${base}.stage_days.mid`);
  const sLate = resolver.needNum(`${base}.stage_days.late`);
  const kcIni = resolver.needNum(`${base}.kc.ini`);
  const kcMid = resolver.needNum(`${base}.kc.mid`);
  const kcEnd = resolver.needNum(`${base}.kc.end`);
  const lens = [sIni, sDev, sMid, sLate].map((p) => {
    const r = Math.round(p.value);
    if (!(r >= 1)) throw new EngineError('DATA_GAP', `Config parameter ${p.path} must be at least 1 day.`);
    return r;
  });
  for (const k of [kcIni, kcMid, kcEnd]) {
    if (k.value < 0) throw new EngineError('DATA_GAP', `Config parameter ${k.path} must not be negative.`);
  }
  const spec: KcSpec = {
    lengths: { initial: lens[0]!, development: lens[1]!, mid: lens[2]!, late: lens[3]! },
    kcIni: kcIni.value, kcMid: kcMid.value, kcEnd: kcEnd.value,
  };
  const total = totalDays(spec);
  if (total > 365) throw new EngineError('DATA_GAP', `Crop ${cropId} has a season of ${total} days, which exceeds 365.`);
  const lenP = resolver.num(`${base}.season_length_days`);
  if (lenP && Math.round(lenP.value) !== total) {
    notes.push(`Crop ${cropId}: season_length_days (${lenP.value}) differs from the sum of stage_days (${total}); the stage days are used.`);
  }

  const waterUses: ParamUse[] = [startP, endP, sIni, sDev, sMid, sLate, kcIni, kcMid, kcEnd];
  let extraMm = 0;
  const extra = resolver.num(`${base}.extra_water_mm`);
  if (extra) {
    if (extra.value < 0) throw new EngineError('DATA_GAP', `Config parameter ${extra.path} must not be negative.`);
    extraMm = extra.value;
    waterUses.push(extra);
  } else {
    const miss = resolver.missing(`${base}.extra_water_mm`);
    if (miss) {
      if (miss.notApplicable) {
        notes.push(`Crop ${cropId}: extra_water_mm is not applicable (no usable value); the fallback of 0 mm is used.`);
      } else {
        waterUses.push(miss.use);
        notes.push(`Crop ${cropId}: extra_water_mm has no usable value; the fallback of 0 mm is used and the result is unresolved.`);
      }
    }
  }

  const kc = dailyKc(spec);
  const doyOf = (day: number): number => ((sowingDoy - 1 + day - 1) % 365) + 1;
  let etcClim = 0;
  let etcStress = 0;
  for (let i = 1; i <= total; i += 1) {
    const d = doyOf(i);
    const ec = climate.et0Clim[d]!;
    const es = climate.et0Stress[d]!;
    if (!Number.isFinite(ec) || !Number.isFinite(es)) {
      throw new EngineError('DATA_GAP', `The climate record has no valid ET0 for day of year ${d} (needed by crop ${cropId}).`);
    }
    etcClim += kc[i - 1]! * ec;
    etcStress += kc[i - 1]! * es;
  }
  const upliftRatio = etcClim > 0 ? etcStress / etcClim - 1 : 0;

  // Heat exposure in the sensitive stage under the stress-year T2M_MAX profile.
  let heat: HeatResult | null = null;
  const heatUses: ParamUse[] = [];
  const thrP = resolver.num(`${base}.heat_stress.threshold_c`);
  const stageP = resolver.str(`${base}.heat_stress.sensitive_stage`);
  if (thrP && stageP) {
    const stage = mapSensitiveStage(stageP.value);
    if (stage === null) {
      notes.push(`Crop ${cropId}: the sensitive stage "${stageP.value}" cannot be mapped to a model stage; heat exposure is omitted for this crop.`);
      heatUses.push(thrP, stageP);
    } else {
      const range = stageRanges(spec)[stage];
      let exposure = 0;
      for (let i = range.startDay; i <= range.endDay; i += 1) {
        const tx = climate.tmaxStress[doyOf(i)]!;
        if (!Number.isFinite(tx)) throw new EngineError('DATA_GAP', `The climate record has no valid T2M_MAX for day of year ${doyOf(i)} (needed by crop ${cropId}).`);
        if (tx > thrP.value) exposure += 1;
      }
      const stageDays = range.endDay - range.startDay + 1;
      heat = { stage, thresholdC: thrP.value, stageDays, exposureDays: exposure, fraction: exposure / stageDays };
      heatUses.push(thrP, stageP, sIni, sDev, sMid, sLate, startP, endP, {
        path: HEAT_MAPPING_USE_PATH, label: 'assumed', evidence_grade: 'provisional', source_id: SOURCE_ENGINE_DEFAULT,
      });
    }
  } else {
    const mt = resolver.missing(`${base}.heat_stress.threshold_c`);
    const ms = resolver.missing(`${base}.heat_stress.sensitive_stage`);
    if (mt && !mt.notApplicable) heatUses.push(mt.use);
    if (ms && !ms.notApplicable) heatUses.push(ms.use);
    notes.push(`Crop ${cropId}: no usable heat-stress definition; heat exposure is omitted for this crop (no heat penalty) and the result is unresolved.`);
  }

  let salinity: CropSeason['salinity'] = null;
  const salUses: ParamUse[] = [];
  const salThr = resolver.num(`${base}.salinity.threshold_ds_m`);
  const salSlope = resolver.num(`${base}.salinity.slope_pct_per_ds_m`);
  if (salThr && salSlope) {
    if (salSlope.value < 0) throw new EngineError('DATA_GAP', `Config parameter ${salSlope.path} must not be negative.`);
    salinity = { thresholdEcDsm: salThr.value, slopePctPerDsm: salSlope.value };
    salUses.push(salThr, salSlope);
  }

  return {
    cropId, season, legume,
    sowingStartDoy: startDoy, sowingEndDoy: endDoy, sowingDoy,
    totalDays: total,
    etcClimMm: etcClim, etcStressMm: etcStress, extraWaterMm: extraMm, waterDemandMm: etcClim + extraMm,
    upliftRatio, heat, salinity,
    refs: { water: uniqueUses(waterUses), heat: uniqueUses(heatUses), salinity: salUses },
    notes,
  };
}

/** Relative yield reduction (percent): slope x (EC - threshold) above the threshold, within 0..100. */
export function relativeYieldReductionPct(ecDsm: number, thresholdEcDsm: number, slopePctPerDsm: number): number {
  if (ecDsm <= thresholdEcDsm) return 0;
  return Math.min(100, Math.max(0, slopePctPerDsm * (ecDsm - thresholdEcDsm)));
}
