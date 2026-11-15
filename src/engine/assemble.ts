/** Builds Plan objects from raw indicator results, adding provenance and evidence. */
import { ParamUse, weakestGrade } from './config.js';
import { RawPlanIndicators } from './indicators.js';
import { round9 } from './scoring.js';
import { EvidenceGrade, IndicatorValue, Plan, ProvenanceEntry, Slot } from './types.js';

export interface IndicatorValueInput {
  water: { value: number; normalized: number };
  soil: { value: number; normalized: number };
  risk: { value: number; normalized: number };
}

function toEntry(u: ParamUse): ProvenanceEntry {
  return { kind: 'config', ref: u.path, label: u.label, evidence_grade: u.evidence_grade, source_id: u.source_id };
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function assemblePlan(args: {
  id: string;
  slots: readonly Slot[];
  raw: RawPlanIndicators;
  values: IndicatorValueInput;
  score: number;
  rank: number;
  pareto: boolean;
}): Plan {
  const { raw, values } = args;
  const mk = (value: number, unit: string, normalized: number, uses: ParamUse[], drivers: RawPlanIndicators['waterDrivers']): IndicatorValue => ({
    value, unit, normalized, uncertainty: null,
    weakest_grade: weakestGrade(uses.map((u) => u.evidence_grade)),
    drivers: drivers.map((d) => ({ label: d.label, share: round9(d.share) })),
  });

  const allUses = new Map<string, ParamUse>();
  for (const u of [...raw.refs.water, ...raw.refs.soil, ...raw.refs.risk]) if (!allUses.has(u.path)) allUses.set(u.path, u);
  const dataEntries = new Map<string, ProvenanceEntry>();
  for (const e of [...raw.dataRefs.water, ...raw.dataRefs.soil, ...raw.dataRefs.risk]) if (!dataEntries.has(e.ref)) dataEntries.set(e.ref, e);
  const configEntries = [...allUses.values()].map(toEntry).sort((a, b) => cmp(a.ref, b.ref));
  const provenance = [...[...dataEntries.values()].sort((a, b) => cmp(a.ref, b.ref)), ...configEntries];

  let provisional = 0;
  let unresolved = 0;
  for (const e of configEntries) {
    if (e.evidence_grade === 'provisional') provisional += 1;
    if (e.evidence_grade === 'unresolved') unresolved += 1;
  }

  return {
    id: args.id,
    slots: args.slots.map((s) => ({ year: s.year, season: s.season, crop_id: s.crop_id })),
    slot_details: raw.slotDetails.map((d) => ({
      ...d,
      water_demand_mm: round9(d.water_demand_mm),
      n_balance_kg_ha: d.n_balance_kg_ha === null ? null : round9(d.n_balance_kg_ha),
      relative_yield_reduction_pct: d.relative_yield_reduction_pct === null ? null : round9(d.relative_yield_reduction_pct),
    })),
    indicators: {
      water_demand_mm_total: mk(values.water.value, 'mm', values.water.normalized, raw.refs.water, raw.waterDrivers),
      soil_health_index: mk(values.soil.value, 'index (0 to 1, higher is better)', values.soil.normalized, raw.refs.soil, raw.soilDrivers),
      climate_risk_index: mk(values.risk.value, 'index (0 to 1, lower is better)', values.risk.normalized, raw.refs.risk, raw.riskDrivers),
    },
    score: args.score,
    rank: args.rank,
    pareto: args.pareto,
    evidence: {
      weakest_grade: weakestGrade(configEntries.map((e) => e.evidence_grade as EvidenceGrade)),
      provisional_count: provisional,
      unresolved_count: unresolved,
    },
    provenance,
  };
}
