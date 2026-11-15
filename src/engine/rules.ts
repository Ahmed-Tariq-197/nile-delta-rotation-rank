/**
 * Rotation rules from the agronomy config (rules.yaml, schema v1.1). Rule types:
 *  - n_credit: nitrogen credit (kg N per ha) received by the slot that follows a "from" crop slot.
 *  - repetition_penalty: expected relative yield loss (fraction) when the same crop is repeated in the same
 *    season of consecutive years (slot k and slot k+2).
 *  - season_constraint: a preceding summer crop must finish before the sowing window of the following winter
 *    crop ends. The effect is unresolved in the config; the fallback is "no extra penalty, check only".
 *  - previous_crop_effect: read and listed, not used in version 1 (the config says to apply at most one of the
 *    N credit and a previous-crop benefit; the N credit is used).
 */
import { CropSeason } from './crops.js';
import { ParamResolver, ParamUse } from './config.js';
import { CROP_IDS, CropId, EngineError, Slot } from './types.js';

export interface CreditRule {
  id: string;
  from: CropId;
  to: CropId | 'any';
  valueKgNHa: number;
  use: ParamUse;
}

export interface RepetitionRule {
  id: string;
  crop: CropId;
  penalty: number;
  use: ParamUse;
}

export interface ConstraintRule {
  id: string;
  from: CropId;
  to: CropId;
  /** Unresolved use that is attached to plans containing the transition. */
  use: ParamUse;
}

export interface RuleSet {
  credits: CreditRule[];
  repetitions: RepetitionRule[];
  constraints: ConstraintRule[];
  unusedIds: string[];
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

export function parseRules(raw: unknown[] | undefined, resolver: ParamResolver): RuleSet {
  const out: RuleSet = { credits: [], repetitions: [], constraints: [], unusedIds: [] };
  (raw ?? []).forEach((r, index) => {
    if (!isObject(r)) throw new EngineError('DATA_GAP', `rules[${index}] is not an object.`);
    const id = typeof r.id === 'string' ? r.id : '';
    if (!id) throw new EngineError('DATA_GAP', `rules[${index}] has no id.`);
    const type = r.type;
    const from = r.from;
    const to = r.to;
    if (!(CROP_IDS as readonly unknown[]).includes(from)) throw new EngineError('DATA_GAP', `Rule ${id} names an unknown "from" crop.`);
    if (!(CROP_IDS as readonly unknown[]).includes(to) && to !== 'any') throw new EngineError('DATA_GAP', `Rule ${id} names an unknown "to" crop.`);
    const path = `rules.${id}.effect`;
    if (type === 'previous_crop_effect') {
      out.unusedIds.push(id);
      return;
    }
    if (type === 'season_constraint') {
      const eff = resolver.num(path);
      const use: ParamUse = eff
        ? { path: eff.path, label: eff.label, evidence_grade: eff.evidence_grade, source_id: eff.source_id }
        : resolver.missing(path)?.use ?? { path, label: 'assumed', evidence_grade: 'unresolved', source_id: 'none' };
      if (to === 'any') throw new EngineError('DATA_GAP', `Season constraint ${id} needs a specific "to" crop.`);
      out.constraints.push({ id, from: from as CropId, to: to as CropId, use });
      return;
    }
    const eff = resolver.num(path);
    if (!eff) {
      resolver.addNote(`Rule ${id} has no usable effect value and is skipped.`);
      return;
    }
    if (type === 'n_credit') {
      if (eff.value < 0) throw new EngineError('DATA_GAP', `Rule ${id} has a negative N credit.`);
      out.credits.push({ id, from: from as CropId, to: to as CropId | 'any', valueKgNHa: eff.value, use: eff });
    } else if (type === 'repetition_penalty') {
      if (eff.value < 0 || eff.value > 1) throw new EngineError('DATA_GAP', `Rule ${id} must have an effect within 0..1.`);
      if (from !== to) throw new EngineError('DATA_GAP', `Repetition rule ${id} must have the same crop in "from" and "to".`);
      out.repetitions.push({ id, crop: from as CropId, penalty: eff.value, use: eff });
    } else {
      throw new EngineError('DATA_GAP', `Rule ${id} has unsupported type "${String(type)}".`);
    }
  });
  return out;
}

/** True when a preceding crop cannot finish before the sowing window of the following crop ends. */
export function constraintViolated(from: CropSeason, to: CropSeason): boolean {
  if (from.season !== 'summer' || to.season !== 'winter') return false;
  const fromEnd = from.sowingDoy + from.totalDays - 1;
  return fromEnd > to.sowingEndDoy;
}

export interface PlanRuleResult {
  /** N credit received by each slot, kg N per ha. */
  creditBySlot: number[];
  /** Mean repetition penalty over the 4 same-season-next-year transitions (0..1). */
  repetitionMean: number;
  violated: boolean;
  fired: ParamUse[];
}

export function evaluatePlanRules(slots: readonly Slot[], rules: RuleSet, crops: ReadonlyMap<CropId, CropSeason>): PlanRuleResult {
  const credit = new Array<number>(slots.length).fill(0);
  const fired: ParamUse[] = [];
  for (let k = 0; k + 1 < slots.length; k += 1) {
    for (const c of rules.credits) {
      if (c.from === slots[k]!.crop_id && (c.to === 'any' || c.to === slots[k + 1]!.crop_id)) {
        credit[k + 1]! += c.valueKgNHa;
        fired.push(c.use);
      }
    }
  }
  let repTotal = 0;
  let repCount = 0;
  for (let k = 0; k + 2 < slots.length; k += 1) {
    repCount += 1;
    if (slots[k]!.crop_id !== slots[k + 2]!.crop_id) continue;
    for (const r of rules.repetitions) {
      if (r.crop === slots[k]!.crop_id) {
        repTotal += Math.min(1, r.penalty);
        fired.push(r.use);
      }
    }
  }
  let violated = false;
  for (let k = 0; k + 1 < slots.length; k += 1) {
    for (const c of rules.constraints) {
      if (c.from === slots[k]!.crop_id && c.to === slots[k + 1]!.crop_id) {
        fired.push(c.use);
        const f = crops.get(c.from);
        const t = crops.get(c.to);
        if (f && t && constraintViolated(f, t)) violated = true;
      }
    }
  }
  return { creditBySlot: credit, repetitionMean: repCount > 0 ? repTotal / repCount : 0, violated, fired };
}
