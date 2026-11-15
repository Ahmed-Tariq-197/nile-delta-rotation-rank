/**
 * Configuration access with evidence-grade tracking, matching the agronomy config schema v1.1.
 *
 * A parameter is an object { value, min, max, unit, source, locator, evidence_grade, confidence, notes }.
 * Rules (decisions R3-D15 and R3-D17 in docs/ENGINE_METHODS.md):
 *  - evidence_grade missing -> unresolved (warned); label missing -> assumed (no warning, the agronomy
 *    config has no label field); source missing -> "none".
 *  - value null with numeric min and max -> the midpoint of min and max is used (warned, grade as given),
 *    as the config's own planner fallback prescribes. value null without bounds -> no usable value.
 *  - a parameter without a usable value can be replaced by a stated fallback with fallbackParam(); the use
 *    is then recorded as unresolved unless the parameter's notes say "not applicable".
 * Paths are dotted. A path segment that is not an index selects the array element with that id, and the
 * first segment "rules" is an alias for "rotation_rules".
 */
import { ConfigFile, ConfigParam, EVIDENCE_GRADES, EngineError, EvidenceGrade, LABELS, Label } from './types.js';

export interface ParamUse {
  path: string;
  label: Label;
  evidence_grade: EvidenceGrade;
  source_id: string;
}

export interface ResolvedParam<T extends number | string = number> extends ParamUse {
  value: T;
  overridden: boolean;
  usedMidpoint: boolean;
}

const GRADE_RANK: Record<EvidenceGrade, number> = { verified: 2, provisional: 1, unresolved: 0 };

export function weakerGrade(a: EvidenceGrade, b: EvidenceGrade): EvidenceGrade {
  return GRADE_RANK[a] <= GRADE_RANK[b] ? a : b;
}

export function weakestGrade(grades: Iterable<EvidenceGrade>): EvidenceGrade {
  let w: EvidenceGrade = 'verified';
  for (const g of grades) w = weakerGrade(w, g);
  return w;
}

export const SOURCE_OVERRIDE = 'override';
export const SOURCE_ENGINE_DEFAULT = 'engine_default';
export const SOURCE_NONE = 'none';
/** Source ids that the agronomy config uses without a register entry. */
const UNREGISTERED_OK = new Set(['memory', 'none']);

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isParamObject(x: unknown): x is Record<string, unknown> {
  return isObject(x) && 'value' in x;
}

export function toUse(p: ParamUse): ParamUse {
  return { path: p.path, label: p.label, evidence_grade: p.evidence_grade, source_id: p.source_id };
}

export interface MissingParam {
  use: ParamUse;
  notApplicable: boolean;
}

export class ParamResolver {
  private readonly config: ConfigFile;
  private readonly overrides: Readonly<Record<string, number>>;
  private readonly sourceIds: ReadonlySet<string>;
  private readonly noteSet = new Set<string>();
  private readonly overrideUsed = new Set<string>();

  constructor(config: ConfigFile, overrides: Readonly<Record<string, number>>) {
    this.config = config;
    this.overrides = overrides;
    this.sourceIds = new Set((config.sources ?? []).map((s) => s.id));
  }

  get notes(): string[] {
    return [...this.noteSet];
  }

  get overridesApplied(): string[] {
    return [...this.overrideUsed].sort();
  }

  addNote(msg: string): void {
    this.noteSet.add(msg);
  }

  validateOverrides(): void {
    for (const [path, value] of Object.entries(this.overrides)) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new EngineError('INVALID_REQUEST', `paramOverrides["${path}"] must be a finite number.`);
      }
      if (path === 'point.elevation_m') continue;
      const node = this.walk(path);
      const leaf = isParamObject(node) ? node.value : node;
      if (!(typeof leaf === 'number' || (leaf === null && isParamObject(node)))) {
        throw new EngineError('INVALID_REQUEST', `paramOverrides path "${path}" does not name a numeric config parameter.`);
      }
    }
  }

  walk(path: string): unknown {
    let node: unknown = this.config;
    const parts = path.split('.');
    for (let i = 0; i < parts.length; i += 1) {
      let part = parts[i]!;
      if (i === 0 && part === 'rules' && isObject(node) && node.rules === undefined) {
        part = 'rotation_rules';
      }
      if (Array.isArray(node)) {
        const idx = Number(part);
        node = Number.isInteger(idx) && String(idx) === part
          ? node[idx]
          : node.find((e) => isObject(e) && e.id === part);
      } else if (isObject(node)) {
        node = Object.prototype.hasOwnProperty.call(node, part) ? node[part] : undefined;
      } else {
        return undefined;
      }
      if (node === undefined) return undefined;
    }
    return node;
  }

  has(path: string): boolean {
    return this.walk(path) !== undefined;
  }

  /** Structural string (for example a season or a crop id) that is not graded. */
  structuralString(path: string): string | undefined {
    const node = this.walk(path);
    const leaf = isParamObject(node) ? node.value : node;
    return typeof leaf === 'string' ? leaf : undefined;
  }

  /** Grade, label and source of a node, with warnings for missing fields. */
  private meta(path: string, node: unknown): ParamUse {
    let label: Label = 'assumed';
    let grade: EvidenceGrade = 'unresolved';
    let source = SOURCE_NONE;
    if (isParamObject(node)) {
      const p = node as unknown as ConfigParam;
      if (p.label !== undefined) {
        if (!(LABELS as readonly string[]).includes(p.label)) throw new EngineError('DATA_GAP', `Config parameter ${path} has an invalid label "${String(p.label)}".`);
        label = p.label;
      }
      if (p.evidence_grade === undefined) {
        this.addNote(`Config parameter ${path} has no evidence grade; treated as unresolved.`);
      } else if ((EVIDENCE_GRADES as readonly string[]).includes(p.evidence_grade)) {
        grade = p.evidence_grade;
      } else {
        throw new EngineError('DATA_GAP', `Config parameter ${path} has an invalid evidence grade "${String(p.evidence_grade)}".`);
      }
      const src = typeof p.source_id === 'string' && p.source_id ? p.source_id : typeof p.source === 'string' && p.source ? p.source : '';
      if (src) {
        source = src;
        if (!this.sourceIds.has(src) && !UNREGISTERED_OK.has(src)) {
          this.addNote(`Config parameter ${path} cites source "${src}", which is not listed in config sources.`);
        }
      } else {
        this.addNote(`Config parameter ${path} has no source.`);
      }
    } else {
      this.addNote(`Config parameter ${path} is a bare value without evidence grade; treated as unresolved.`);
    }
    return { path, label, evidence_grade: grade, source_id: source };
  }

  /** Resolves a numeric parameter, or undefined when the config has no usable value for it. */
  num(path: string, displayPath: string = path): ResolvedParam<number> | undefined {
    const node = this.walk(path);
    if (node === undefined) return undefined;
    const base = this.meta(displayPath, node);
    let raw: unknown = isParamObject(node) ? node.value : node;
    let overridden = false;
    let usedMidpoint = false;
    const hasOverride = Object.prototype.hasOwnProperty.call(this.overrides, path) || Object.prototype.hasOwnProperty.call(this.overrides, displayPath);
    if (hasOverride) {
      raw = Object.prototype.hasOwnProperty.call(this.overrides, path) ? this.overrides[path] : this.overrides[displayPath];
      overridden = true;
      this.overrideUsed.add(displayPath);
      return { ...base, label: 'assumed', evidence_grade: 'unresolved', source_id: SOURCE_OVERRIDE, value: raw as number, overridden, usedMidpoint };
    }
    if (raw === null && isParamObject(node)) {
      const lo = node.min;
      const hi = node.max;
      if (typeof lo === 'number' && typeof hi === 'number' && Number.isFinite(lo) && Number.isFinite(hi)) {
        raw = (lo + hi) / 2;
        usedMidpoint = true;
        this.addNote(`Config parameter ${displayPath} has no central value; the midpoint of its range (${lo} to ${hi}) is used.`);
      } else {
        return undefined;
      }
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      throw new EngineError('DATA_GAP', `Config parameter ${displayPath} must be a finite number.`);
    }
    return { ...base, value: raw, overridden, usedMidpoint };
  }

  str(path: string): ResolvedParam<string> | undefined {
    const node = this.walk(path);
    if (node === undefined) return undefined;
    const base = this.meta(path, node);
    const raw: unknown = isParamObject(node) ? node.value : node;
    if (raw === null) return undefined;
    if (typeof raw !== 'string') throw new EngineError('DATA_GAP', `Config parameter ${path} must be a string.`);
    return { ...base, value: raw, overridden: false, usedMidpoint: false };
  }

  needNum(path: string): ResolvedParam<number> {
    const p = this.num(path);
    if (!p) throw new EngineError('DATA_GAP', `Config is missing a usable value for required parameter ${path}.`);
    return p;
  }

  /**
   * Describes a parameter that has no usable value so that a fallback can be applied and reported.
   * Returns undefined when the path does not exist in the config.
   */
  missing(path: string): MissingParam | undefined {
    const node = this.walk(path);
    if (node === undefined) return undefined;
    const base = this.meta(path, node);
    const notes = isParamObject(node) && typeof node.notes === 'string' ? node.notes : '';
    const notApplicable = /not applicable/i.test(notes);
    return { use: { ...base, evidence_grade: 'unresolved' }, notApplicable };
  }
}

/** Removes duplicates by path, keeping first occurrence order. */
export function uniqueUses(uses: Iterable<ParamUse>): ParamUse[] {
  const seen = new Map<string, ParamUse>();
  for (const u of uses) if (!seen.has(u.path)) seen.set(u.path, u);
  return [...seen.values()];
}
