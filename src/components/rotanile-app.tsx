import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button, CropBadge, CropCell, DataTable, Field, GradeChip, InlineMessage, LabelChip } from "@/components/ui/pieces";
import { Shell } from "@/components/layout";
import { CROP_LIST, NAVIGATION_ITEMS, POWER_VARIABLE_LABELS, PROPOSED_POINTS, REGION_FILES, SCHEMA_ROWS } from "@/lib/app-content";
import { encodePlannerHash, parsePlannerHash } from "@/lib/derive";
import { formatDate, formatNullable, scoreFormatter } from "@/lib/format";
import type { CropId, EvidenceGrade, EngineResponse, NdviFile, Plan, Priorities, ProvenanceEntry } from "@/lib/contract";
import type { ActualBundle, BundleError, EvidenceContext } from "@/lib/app-types";

type ViewSection = "/" | "/method" | "/global" | "/about";

const LazyMethodView = lazy(() => import("@/views/method-view"));
const LazyGlobalView = lazy(() => import("@/views/global-view"));
const LazyAboutView = lazy(() => import("@/views/about-view"));

const DATA_BASE = `${import.meta.env.BASE_URL}data/`;

function DataUnavailable({ error, retry }: { error: BundleError | null; retry: () => void }) {
  return (
    <InlineMessage
      title="The crop data are not available"
      detail="The RotaNile browser data bundle has not been supplied. Add the approved data bundle to load Delta points, measured records and configuration; no sample values are shown."
      variant="error"
    >
      <p className="provenance-ref">{error ? `Bundle issue: ${error.kind}. ${error.detail}` : "Bundle issue: bundle_missing"}</p>
      <Button className="retry-button" onClick={retry}>Try again</Button>
    </InlineMessage>
  );
}

function StatusContext({ bundle }: { bundle: ActualBundle | null }) {
  if (!bundle) return <p className="notice-text">Latest available data date is not supplied.</p>;
  return <p className="notice-text">Latest available data through {formatDate(bundle.manifest.data.end_date)}.</p>;
}

function showIndicatorLabel(key: string) {
  return key === "water_demand_mm_total" ? "Water demand over six seasons" : key === "soil_health_index" ? "Soil health" : "Climate risk";
}

function EvidenceButton({ onOpen }: { onOpen: () => void }) {
  return <Button variant="quiet" onClick={onOpen}>Evidence details</Button>;
}

function cropName(id: CropId) {
  return CROP_LIST.find((item) => item.id === id)?.name ?? id;
}

function PlannerView({
  bundle,
  error,
  retry,
  openEvidence,
}: {
  bundle: ActualBundle | null;
  error: BundleError | null;
  retry: () => void;
  openEvidence: (context: EvidenceContext) => void;
}) {
  const parsed = parsePlannerHash(typeof window === "undefined" ? "#/" : window.location.hash);
  const [selectedPoint, setSelectedPoint] = useState(parsed.pointId ?? "");
  const [weights, setWeights] = useState(parsed.priorities);
  const [salinity, setSalinity] = useState(parsed.salinity === null ? "" : String(parsed.salinity));
  const [cap, setCap] = useState(parsed.waterCap === null ? "" : String(parsed.waterCap));
  const [enabledCrops, setEnabledCrops] = useState<string[] | null>(parsed.allowedCrops);
  const [dirty, setDirty] = useState(false);
  const [chartMode, setChartMode] = useState<"chart" | "table">("table");
  const [smallScreenChart, setSmallScreenChart] = useState(false);
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("rank");
  const [page, setPage] = useState(0);
  const [expandedPointInputs, setExpandedPointInputs] = useState(true);
  const [response, setResponse] = useState<EngineResponse | null>(null);
  const [engineMessage, setEngineMessage] = useState<string | null>(null);
  const [dataFilesMissing, setDataFilesMissing] = useState<string[]>([]);
  const [salinityError, setSalinityError] = useState("");
  const [capError, setCapError] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(parsed.planId);
  const [resultsState, setResultsState] = useState<"idle" | "loading" | "ready" | "empty">("idle");
  const runCount = useRef(0);
  const [notice, setNotice] = useState("");
  const priorityTotal = weights.water + weights.soil_health + weights.climate_risk;
  const normalizedWeights = priorityTotal > 0
    ? { water: weights.water / priorityTotal, soil_health: weights.soil_health / priorityTotal, climate_risk: weights.climate_risk / priorityTotal }
    : null;

  useEffect(() => {
    if (!bundle) return;
    const available = new Set(bundle.points.points.map((point) => point.id));
    if (!selectedPoint || !available.has(selectedPoint)) setSelectedPoint(bundle.points.points[0]?.id ?? "");
    if (!enabledCrops) setEnabledCrops([...CROP_LIST.map((crop) => crop.id)]);
    const files = [...CROP_LIST.map((crop) => `ndvi/${crop.id}.json`)].filter((path) => !path);
    setDataFilesMissing(files);
  }, [bundle, enabledCrops, selectedPoint]);

  useEffect(() => {
    if (!bundle || !selectedPoint) return;
    const missing = bundle.points.points.filter((point) => !bundle.ndvi[point.id]).map((point) => `ndvi/${point.id}.json`);
    setDataFilesMissing(missing);
  }, [bundle, selectedPoint]);

  useEffect(() => {
    if (priorityTotal <= 0) {
      setNotice("Set at least one priority above zero.");
      return;
    }
    if (!bundle || !selectedPoint) return;
    const nextRun = ++runCount.current;
    setResultsState(response ? "ready" : "loading");
    const timer = window.setTimeout(() => {
      setEngineMessage("The calculation engine was not included. Engine-backed rankings are unavailable.");
      setResponse(null);
      setResultsState("empty");
    }, 200);
    return () => {
      window.clearTimeout(timer);
      if (nextRun === runCount.current) runCount.current += 1;
    };
  }, [bundle, selectedPoint, weights, salinity, cap, enabledCrops, priorityTotal]);

  const updateHash = useCallback((planId: string | null) => {
    if (typeof window === "undefined") return;
    const next = encodePlannerHash("/", {
      pointId: selectedPoint || null,
      priorities: weights,
      salinity: salinity === "" ? null : Number(salinity),
      allowedCrops: enabledCrops && enabledCrops.length !== CROP_LIST.length ? enabledCrops : null,
      waterCap: cap === "" ? null : Number(cap),
      planId,
    });
    if (window.location.hash !== next) window.history.replaceState(null, "", next);
  }, [selectedPoint, weights, salinity, enabledCrops, cap]);

  useEffect(() => updateHash(selectedPlanId), [updateHash, selectedPlanId]);

  const noSeasonWarning = enabledCrops !== null && (
    !enabledCrops.some((id) => CROP_LIST.some((crop) => crop.id === id && crop.season === "winter")) ||
    !enabledCrops.some((id) => CROP_LIST.some((crop) => crop.id === id && crop.season === "summer"))
  );

  const currentPlan = response?.plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const rankedPlans = (response?.top_ids ?? []).map((id) => response?.plans.find((plan) => plan.id === id)).filter((plan): plan is Plan => !!plan);
  const planTableRows = (response?.plans ?? [])
    .filter((plan) => filter === "" || String(plan.rank).includes(filter) || plan.id.toLowerCase().includes(filter.toLowerCase()))
    .slice()
    .sort((a, b) => sortBy === "water" ? a.indicators.water_demand_mm_total.value - b.indicators.water_demand_mm_total.value : sortBy === "score" ? b.score - a.score : a.rank - b.rank);
  const pageRows = planTableRows.slice(page * 25, page * 25 + 25);
  const pageCount = Math.max(1, Math.ceil(planTableRows.length / 25));

  const choosePlan = (plan: Plan) => setSelectedPlanId(plan.id);

  const reset = () => {
    setWeights({ water: 1 / 3, soil_health: 1 / 3, climate_risk: 1 / 3 });
    setSalinity("");
    setCap("");
    setEnabledCrops(CROP_LIST.map((crop) => crop.id));
    setSalinityError("");
    setCapError("");
  };

  const toggleCrop = (id: string) => {
    setEnabledCrops((current) => {
      const values = current ?? CROP_LIST.map((crop) => crop.id);
      return values.includes(id) ? values.filter((crop) => crop !== id) : [...values, id];
    });
  };

  const selectedPointRecord = bundle?.points.points.find((point) => point.id === selectedPoint);
  const selectedArea = selectedPointRecord?.area ?? "No point selected";
  const activeNdvi = bundle?.ndvi[selectedPoint];

  return (
    <div className="page-shell">
      <div className="page-heading">
        <h1 id="view-heading">Top plans for {selectedArea}</h1>
        <StatusContext bundle={bundle} />
        <p className="notice-text">Planning support, not a forecast.</p>
        {resultsState === "loading" ? <p className="notice-text" role="status">Loading plans.</p> : null}
      </div>

      {parsed.invalid ? <InlineMessage title="Some URL inputs were ignored" detail="Review the values you entered and set them again." variant="warning" /> : null}
      {!bundle ? <DataUnavailable error={error} retry={retry} /> : null}

      {bundle ? (
        <div className="planner-layout">
          <aside className="input-rail" aria-label="Planner inputs">
            <div className="point-input-disclosure">
              <Button variant="secondary" aria-expanded={expandedPointInputs} onClick={() => setExpandedPointInputs((open) => !open)}>Change inputs</Button>
            </div>
            <div className="input-stack" hidden={!expandedPointInputs}>
              <section aria-labelledby="point-choice-title">
                <h2 className="section-heading" id="point-choice-title">Choose a point</h2>
                <p className="field-hint">The location records are proposed and have not been checked on a map.</p>
                <div className="point-list" role="radiogroup" aria-label="Nile Delta points">
                  {PROPOSED_POINTS.map((point) => (
                    <button key={point.id} className="point-choice" type="button" role="radio" aria-checked={selectedPoint === point.id} tabIndex={selectedPoint === point.id ? 0 : -1} onClick={() => setSelectedPoint(point.id)} onKeyDown={(event) => {
                      const index = PROPOSED_POINTS.findIndex((candidate) => candidate.id === selectedPoint);
                      const move = event.key === "ArrowDown" || event.key === "ArrowRight" ? 1 : event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 0;
                      if (move !== 0) {
                        event.preventDefault();
                        const next = PROPOSED_POINTS[(index + move + PROPOSED_POINTS.length) % PROPOSED_POINTS.length];
                        if (next) setSelectedPoint(next.id);
                      }
                    }}>
                      <strong>{point.area}</strong>
                      <span>{point.locationNote}</span>
                      <span>Vegetation record not supplied.</span>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-labelledby="priorities-title">
                <h2 className="section-heading" id="priorities-title">Set your priorities</h2>
                {([
                  ["water", "Water", "Favors plans that need less irrigation water."],
                  ["soil_health", "Soil health", "Favors plans with a better nitrogen and rotation record."],
                  ["climate_risk", "Climate risk", "Favors plans less exposed to heat and water stress."],
                ] as const).map(([key, label, hint]) => (
                  <div className="field-block" key={key}>
                    <div className="range-heading"><label className="field-label" htmlFor={`weight-${key}`}>{label}</label><span className="range-value">{formatNullable((normalizedWeights?.[key] ?? 0) * 100)}%</span></div>
                    <input className="range-field" id={`weight-${key}`} type="range" min="0" max="1" step="0.05" value={weights[key]} aria-valuetext={`${formatNullable((normalizedWeights?.[key] ?? 0) * 100)} percent of total priority`} onChange={(event) => setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))} />
                    <span className="field-hint">{hint}</span>
                  </div>
                ))}
                {normalizedWeights ? <p className="field-hint" aria-live="polite">Weights used: water {formatNullable(normalizedWeights.water * 100)} percent, soil health {formatNullable(normalizedWeights.soil_health * 100)} percent, climate risk {formatNullable(normalizedWeights.climate_risk * 100)} percent.</p> : <InlineMessage title="Set at least one priority above zero." variant="error" />}
              </section>

              <section aria-labelledby="soil-title">
                <h2 className="section-heading" id="soil-title">Soil</h2>
                <Field inputId="salinity" label="Soil salinity" optional unit="dS/m" hint="Electrical conductivity of the soil. Leave empty if unknown; plans then ignore salinity yield loss." error={salinityError}>
                  <input id="salinity" className="number-input" inputMode="decimal" value={salinity} onChange={(event) => setSalinity(event.target.value)} onBlur={() => setSalinityError(salinity !== "" && (!Number.isFinite(Number(salinity)) || Number(salinity) < 0) ? "Enter 0 or a positive number, for example 2.5." : "")} aria-describedby="salinity-error" />
                </Field>
              </section>

              <section aria-labelledby="constraints-title">
                <h2 className="section-heading" id="constraints-title">Constraints</h2>
                <p className="field-hint">Turn off crops you cannot grow. Plans use only the crops left on.</p>
                <div className="crop-toggles" role="group" aria-label="Allowed crops">
                  {CROP_LIST.map((crop) => {
                    const active = (enabledCrops ?? CROP_LIST.map((item) => item.id)).includes(crop.id);
                    return <button key={crop.id} className="crop-toggle" type="button" role="switch" aria-checked={active} onClick={() => toggleCrop(crop.id)}><span className="crop-chip" style={{ backgroundColor: crop.color }}>{crop.letter}</span>{crop.name}</button>;
                  })}
                </div>
                {noSeasonWarning ? <InlineMessage title="Plans need at least one winter crop and one summer crop." variant="warning" /> : null}
                <Field inputId="seasonal-cap" label="Seasonal water cap" optional unit="mm per season" hint="Plans that need more water in any one season are removed." error={capError}>
                  <input id="seasonal-cap" className="number-input" inputMode="decimal" value={cap} onChange={(event) => setCap(event.target.value)} onBlur={() => setCapError(cap !== "" && (!Number.isFinite(Number(cap)) || Number(cap) < 0) ? "Enter 0 or a positive number." : "")} aria-describedby="seasonal-cap-error" />
                </Field>
                <Button variant="quiet" onClick={reset}>Reset inputs</Button>
              </section>
            </div>
          </aside>

          <div className="planner-results" aria-busy={resultsState === "loading"}>
            {engineMessage ? <InlineMessage title="Engine results are unavailable" detail={engineMessage} variant="warning" /> : null}
            {dataFilesMissing.length > 0 ? <InlineMessage title="Data bundle is incomplete" detail="The observation records needed by these views were not included." variant="warning">{dataFilesMissing.map((path) => <p key={path} className="provenance-ref">{path}</p>)}</InlineMessage> : null}
            <section aria-labelledby="plans-title">
              <h2 className="sr-only" id="plans-title">Ranked plans</h2>
              {resultsState === "loading" ? <p className="chart-wrap">Loading plans. Calculation results are not available.</p> : null}
              {rankedPlans.length > 0 ? (
                <>
                  {rankedPlans[0] ? <PlanCard plan={rankedPlans[0]} lead onSelect={choosePlan} selected={selectedPlanId === rankedPlans[0].id} onEvidence={() => openEvidence({ title: `Rank ${rankedPlans[0]?.rank} evidence`, detail: "Plan evidence and source records.", plan: rankedPlans[0] })} /> : null}
                  <div className="plan-pair">{rankedPlans.slice(1).map((plan) => <PlanCard key={plan.id} plan={plan} onSelect={choosePlan} selected={selectedPlanId === plan.id} onEvidence={() => openEvidence({ title: `Rank ${plan.rank} evidence`, detail: "Plan evidence and source records.", plan })} />)}</div>
                </>
              ) : null}
              {!response ? <InlineMessage title="No ranked plans to show" detail="Add the supplied calculation engine and data bundle. Then change a priority or constraint to see the engine results." variant="warning" /> : null}
            </section>

            <section aria-labelledby="pareto-heading">
              <h2 id="pareto-heading">How the plans trade off</h2>
              <p className="section-description">Each dot is a plan that meets your constraints. Plans toward the upper left use less water and keep more soil health.</p>
              {response ? (
                <>
                  <div className="control-row view-tabs"><Button aria-pressed={chartMode === "chart"} onClick={() => setChartMode("chart")}>Show chart</Button><Button aria-pressed={chartMode === "table"} onClick={() => setChartMode("table")}>Show as table</Button></div>
                  {chartMode === "table" ? <PlanTable plans={pageRows} total={planTableRows.length} page={page} setPage={setPage} pageCount={pageCount} filter={filter} setFilter={setFilter} sortBy={sortBy} setSortBy={setSortBy} onSelect={choosePlan} /> : <PlanChart plans={response.plans} frontIds={response.pareto_front_ids} selectedPlan={currentPlan} onSelect={choosePlan} />}
                  {response.plans.length < 3 ? <InlineMessage title={`Only ${response.plans.length} plans meet your constraints.`} variant="warning" /> : null}
                </>
              ) : <div className="chart-wrap"><p>No plans to plot. Add the supplied data bundle and calculation engine before using planner scores.</p></div>}
            </section>

            <section aria-labelledby="selected-plan-heading">
              <h2 id="selected-plan-heading">Selected plan, season by season</h2>
              {currentPlan ? <SelectedPlanTable plan={currentPlan} onEvidence={() => openEvidence({ title: `Rank ${currentPlan.rank} evidence`, detail: "Plan evidence and source records.", plan: currentPlan })} onFigure={(detail) => openEvidence({ title: "Season evidence", detail, plan: currentPlan })} salinity={salinity} /> : <div className="table-wrap"><p className="page-count">The season table will appear when the calculation results are supplied.</p></div>}
            </section>

            <section aria-labelledby="ndvi-heading">
              <h2 id="ndvi-heading">Observed vegetation index at this point</h2>
              <p className="section-description">NDVI is shown as context. It is not an input to the plan scores. <LabelChip label="observed" /></p>
      {activeNdvi ? <NdviView file={activeNdvi} onEvidence={() => openEvidence({ title: "Vegetation record", detail: "Product details and composite counts.", pointId: selectedPoint })} /> : <div className="chart-wrap"><p>No vegetation record was supplied for {selectedArea}. Data values and dates are not shown without the original bundle.</p></div>}
            </section>

            <section aria-labelledby="limits-heading">
              <h2 id="limits-heading">Limits of this tool</h2>
              <p className="section-description">Planning support, not a forecast.</p>
              {response?.limits.length ? <ul>{response.limits.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>The engine and its limits statement have not been supplied.</p>}
              {response?.warnings.length ? <><h3>Warnings from the engine</h3><ul>{response.warnings.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></> : null}
              <p className="section-description">The tool is demonstrated for the Nile Delta only and has not been validated elsewhere.</p>
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({ plan, lead = false, selected, onSelect, onEvidence }: { plan: Plan; lead?: boolean; selected: boolean; onSelect: (plan: Plan) => void; onEvidence: () => void }) {
  return (
    <article className={`plan-card ${lead ? "lead" : ""} ${selected ? "selected" : ""}`} aria-current={selected ? "true" : undefined}>
      <button className="plan-header" type="button" aria-label={`Select rank ${plan.rank} plan`} onClick={() => onSelect(plan)}>
        <h3>Rank {plan.rank}</h3><span className="score">Score {scoreFormatter.format(plan.score)}</span><span className="muted">out of 1</span>
      </button>
      {plan.pareto ? <p className="notice-text">On the trade-off front.</p> : null}
      <div className="year-sequence" aria-label="Three-year rotation">
        {[1, 2, 3].map((year) => <div className="year-pair" key={year}><span className="year-label">Year {year}</span><div className="year-cells">{plan.slots.filter((slot) => slot.year === year).map((slot) => <CropCell key={`${slot.year}-${slot.season}`} cropId={slot.crop_id} label={`Year ${year}, ${slot.season}`} />)}</div></div>)}
      </div>
      <div className="indicator-list">
        {(Object.entries(plan.indicators) as [string, Plan["indicators"]["water_demand_mm_total"]][]).map(([key, value]) => (
          <div className="indicator-item" key={key}>
            <div className="indicator-title"><strong>{showIndicatorLabel(key)}</strong><span>{formatNullable(value.value, key === "water_demand_mm_total" ? 0 : 2)} {value.unit}</span></div>
            <div className="indicator-track" aria-label={`${showIndicatorLabel(key)}, relative position ${scoreFormatter.format(value.normalized)}`}><span className="indicator-tick" style={{ left: `${Math.max(0, Math.min(100, value.normalized * 100))}%` }} /></div>
            <div className="track-ends"><span>Worse</span><span>Better</span></div>
          </div>
        ))}
      </div>
      {lead ? <p className="field-hint">Position shows how a plan compares with the other plans that meet your constraints, not an absolute score.</p> : null}
      <div className="evidence-line"><GradeChip grade={plan.evidence.weakest_grade} />{[...new Set(plan.provenance.map((item) => item.label))].map((label) => <LabelChip key={label} label={label} />)}<EvidenceButton onOpen={onEvidence} /></div>
      <details className="disclosure" open={lead}><summary>Why this plan</summary><p className="field-hint">Ranked {plan.rank}. The engine’s explanation is limited to the fields included in this plan and its evidence record.</p></details>
    </article>
  );
}

function PlanChart({ plans, frontIds, selectedPlan, onSelect }: { plans: Plan[]; frontIds: string[]; selectedPlan: Plan | null; onSelect: (plan: Plan) => void }) {
  const pointWidth = 760;
  const pointHeight = 330;
  const left = 62;
  const top = 20;
  const plotWidth = 650;
  const plotHeight = 250;
  const values = plans.map((plan) => plan.indicators.water_demand_mm_total.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = (max - min || 1) * 0.04;
  const sorted = [...plans].sort((a, b) => a.indicators.water_demand_mm_total.value - b.indicators.water_demand_mm_total.value);
  const front = frontIds.map((id) => plans.find((plan) => plan.id === id)).filter((plan): plan is Plan => !!plan).sort((a, b) => a.indicators.water_demand_mm_total.value - b.indicators.water_demand_mm_total.value);
  const x = (plan: Plan) => left + ((plan.indicators.water_demand_mm_total.value - min + padding) / (max - min + padding * 2)) * plotWidth;
  const y = (plan: Plan) => top + (1 - plan.indicators.soil_health_index.value) * plotHeight;
  const linePath = front.map((plan, index) => `${index === 0 ? "M" : "H"} ${x(plan)} ${index === 0 ? `V ${y(plan)}` : ""}`).join(" ");

  return (
    <div className="chart-wrap">
      {plans.length === 0 ? <p>No plans to plot. Change the constraints or the point.</p> : (
        <>
          <p className="chart-summary">{plans.length} plans, {front.length} on the trade-off front. Water demand ranges from {formatNullable(min)} to {formatNullable(max)} mm. Soil health is shown from 0 to 1.</p>
          <svg className="chart-svg" viewBox={`0 0 ${pointWidth} ${pointHeight}`} role="group" aria-label="Plans by water demand and soil health">
            <title>How the plans trade off</title><desc>Each circle is a plan. Focus and select a plan to update its details.</desc>
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => <g key={tick}><line className="chart-grid-line" x1={left} x2={left + plotWidth} y1={top + tick * plotHeight} y2={top + tick * plotHeight} /><text className="chart-label" x={left - 12} y={top + tick * plotHeight + 4} textAnchor="end">{formatNullable(1 - tick, 2)}</text></g>)}
            <line className="chart-axis" x1={left} x2={left + plotWidth} y1={top + plotHeight} y2={top + plotHeight} />
            <line className="chart-axis" x1={left} x2={left} y1={top} y2={top + plotHeight} />
            <text className="chart-label" x={left + plotWidth / 2} y={pointHeight - 7} textAnchor="middle">Water demand (mm), lower is better</text>
            <text className="chart-label" transform={`translate(16 ${top + plotHeight / 2}) rotate(-90)`} textAnchor="middle">Soil health, higher is better</text>
            {front.length > 0 ? <path d={linePath} fill="none" stroke="var(--gold)" strokeWidth="1.5" /> : null}
            {sorted.map((plan) => <g key={plan.id} className="plot-dot" tabIndex={0} role="img" aria-label={`Rank ${plan.rank}, water ${formatNullable(plan.indicators.water_demand_mm_total.value)} millimeters, soil health ${formatNullable(plan.indicators.soil_health_index.value, 2)}, climate risk ${formatNullable(plan.indicators.climate_risk_index.value, 2)}`} onClick={() => onSelect(plan)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(plan); } }}><circle cx={x(plan)} cy={y(plan)} r={plan.id === selectedPlan?.id ? 8 : 5} fill="var(--gold)" stroke={plan.id === selectedPlan?.id ? "var(--ivory)" : "var(--ink)"} strokeWidth={plan.id === selectedPlan?.id ? 2 : 1} /><title>Rank {plan.rank}</title></g>)}
          </svg>
          <p className="chart-summary">Horizontal axis does not start at 0. Water demand ranges from {formatNullable(min)} to {formatNullable(max)} millimeters.</p>
        </>
      )}
    </div>
  );
}

function PlanTable({ plans, total, page, setPage, pageCount, filter, setFilter, sortBy, setSortBy, onSelect }: { plans: Plan[]; total: number; page: number; setPage: (page: number) => void; pageCount: number; filter: string; setFilter: (filter: string) => void; sortBy: string; setSortBy: (sortBy: string) => void; onSelect: (plan: Plan) => void }) {
  return (
    <>
      <div className="method-filter-row"><label className="field-block"><span className="field-label">Find a plan</span><input className="search-input" value={filter} onChange={(event) => { setFilter(event.target.value); setPage(0); }} /></label><label className="field-block"><span className="field-label">Sort plans</span><select className="select-input" value={sortBy} onChange={(event) => setSortBy(event.target.value)}><option value="rank">Rank</option><option value="water">Water demand</option><option value="score">Score</option></select></label></div>
      <p className="notice-text" role="status">{total} plans.</p>
      <DataTable headers={["Rank", "Plan", "Water demand (mm)", "Soil health", "Climate risk", "Score", "On front"]} rows={plans.map((plan) => [<Button key={plan.id} variant="quiet" onClick={() => onSelect(plan)}>Select rank {plan.rank} plan</Button>, plan.slots.map((slot) => CROP_LIST.find((crop) => crop.id === slot.crop_id)?.letter).join(" "), formatNullable(plan.indicators.water_demand_mm_total.value), formatNullable(plan.indicators.soil_health_index.value, 2), formatNullable(plan.indicators.climate_risk_index.value, 2), scoreFormatter.format(plan.score), plan.pareto ? "Yes" : "No"])} caption="All plan rows come from the calculation engine. Every row retains its evidence through the plan details." />
      <p className="page-count">{total === 0 ? "No plans match the current search." : `${page * 25 + 1} to ${Math.min(total, page * 25 + plans.length)} of ${total}`} <Button variant="quiet" disabled={page <= 0} onClick={() => setPage(page - 1)}>Previous page</Button><Button variant="quiet" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>Next page</Button></p>
    </>
  );
}

function SelectedPlanTable({ plan, onEvidence, onFigure, salinity }: { plan: Plan; onEvidence: () => void; onFigure: (detail: string) => void; salinity: string }) {
  const rows = plan.slot_details.map((slot) => [String(slot.year), slot.season, <span className="crop-legend" key={`${slot.year}-${slot.season}`}><CropCell cropId={slot.crop_id} label={`Year ${slot.year}, ${slot.season}`} />{cropName(slot.crop_id)}</span>, <button className="button-reset action-button quiet" key={`${slot.year}-water`} onClick={() => onFigure(`Estimated crop water demand for ${slot.season}, year ${slot.year}, in millimeters.`)}>{formatNullable(slot.water_demand_mm)}</button>, <span key={`${slot.year}-n`} className="nitrogen-column">{formatNullable(slot.n_balance_kg_ha)}</span>, formatNullable(slot.relative_yield_reduction_pct)] as const);
  return (
    <>
      <p className="section-description">Rank {plan.rank}. Evidence for this plan: weakest grade {plan.evidence.weakest_grade}, labels {[...new Set(plan.provenance.map((entry) => entry.label))].join(", ") || "not supplied"}. The engine reports evidence per plan, not per season.</p>
      <div className="evidence-line"><GradeChip grade={plan.evidence.weakest_grade} />{[...new Set(plan.provenance.map((entry) => entry.label))].map((label) => <LabelChip key={label} label={label} />)}<EvidenceButton onOpen={onEvidence} /></div>
      {plan.slot_details.length ? <DataTable headers={["Year", "Season", "Crop", "Water demand (mm)", "Nitrogen balance (kg per ha)", "Yield reduction from salinity (percent)"]} rows={rows} caption={`Rank ${plan.rank} seasonal estimates. Null values are not available.`} /> : <p className="page-count">Season details are not available in this engine response.</p>}
      {!salinity ? <p className="field-hint">Enter a soil salinity value to see yield reduction from salinity.</p> : null}
    </>
  );
}

function NdviView({ file, onEvidence }: { file: NdviFile; onEvidence: () => void }) {
  const accepted = file.composite_dates.map((date, index) => ({ date, value: file.ndvi[index], quality: file.quality_ok[index] })).filter((entry) => entry.quality && entry.value !== null && entry.value !== undefined);
  const qualityCounts = file.composite_dates.reduce((counts, _date, index) => ({ total: counts.total + 1, passed: counts.passed + (file.quality_ok[index] ? 1 : 0) }), { total: 0, passed: 0 });
  return <div className="chart-wrap"><p className="chart-summary">{file.product} version {file.version}.</p>{accepted.length > 0 ? <p className="chart-summary">{accepted.length} valid composites shown. The scale factor is {formatNullable(file.scale_applied, 2)}.</p> : <p>No valid composites for this point.</p>}<Button variant="quiet" onClick={onEvidence}>Evidence details</Button><p className="page-count">Quality checks passed: {qualityCounts.passed} of {qualityCounts.total} composites. NDVI is not used in plan scores.</p></div>;
}

function EvidenceDrawer({ context, bundle, onClose }: { context: EvidenceContext | null; bundle: ActualBundle | null; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visibleSources, setVisibleSources] = useState(12);
  useEffect(() => {
    setVisibleSources(12);
    if (context) ref.current?.focus();
  }, [context]);
  if (!context) return null;
  const plan = context.plan;
  const sources = new Map((bundle?.config.sources ?? []).map((source) => [source.id, source]));
  const provenance = plan?.provenance ?? [];
  const dataEntries = provenance.filter((entry) => entry.kind === "data");
  const configEntries = provenance.filter((entry) => entry.kind === "config");
  const sourceIds = [...new Set(configEntries.flatMap((entry) => entry.source_id ? [entry.source_id] : []))];
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside className="drawer-panel drawer-mobile" aria-label="Evidence details" aria-modal="true" role="dialog" ref={ref} tabIndex={-1}>
        <div className="drawer-heading"><div><h2>{context.title}</h2><p className="field-hint">{context.detail}</p></div><Button aria-label="Close" onClick={onClose}>Close</Button></div>
        {plan ? <>
          <h3>Evidence for rank {plan.rank}</h3>
          <p className="section-description">Weakest grade: <GradeChip grade={plan.evidence.weakest_grade} /></p>
          <h3>Where the numbers come from</h3>
          <section className="source-row"><h4>Data</h4>{dataEntries.slice(0, visibleSources).map((entry, index) => <ProvenanceRow entry={entry} key={`${entry.ref}-${index}`} />)}</section>
          <section className="source-row"><h4>Configuration</h4>{configEntries.slice(0, visibleSources).map((entry, index) => <ProvenanceRow entry={entry} key={`${entry.ref}-${index}`} />)}</section>
          {provenance.length > visibleSources ? <Button variant="quiet" onClick={() => setVisibleSources(provenance.length)}>Show all {provenance.length}</Button> : null}
          <h3 className="section-block">Sources</h3>
          {sourceIds.length ? sourceIds.map((id) => {
            const source = sources.get(id);
            return source ? <div className="source-row" key={id} id={`source-${id}`}><strong>{source.id}</strong><p>{source.citation}</p><p className="provenance-ref">{source.url_or_doi}</p><p>{source.date_opened}. {source.access_status}.</p></div> : null;
          }) : <p>No source records were returned for this plan.</p>}
          <a className="action-button" href="#/method">See all assumptions and sources</a>
        </> : <p>Select a number to see where it comes from.</p>}
      </aside>
    </>
  );
}

function ProvenanceRow({ entry }: { entry: ProvenanceEntry }) {
  return <div className="source-row"><code className="provenance-ref">{entry.ref}</code><div className="evidence-line"><LabelChip label={entry.label} />{entry.evidence_grade ? <GradeChip grade={entry.evidence_grade} /> : null}</div>{entry.source_id ? <a className="notice-text" href={`#source-${encodeURIComponent(entry.source_id)}`}>{entry.source_id}</a> : null}</div>;
}

function MethodView({ bundle, response, openEvidence, retry, loading, error }: { bundle: ActualBundle | null; response: EngineResponse | null; openEvidence: (context: EvidenceContext) => void; retry: () => void; loading: boolean; error: BundleError | null }) {
  const [search, setSearch] = useState("");
  const [rule, setRule] = useState("");
  const [showReason, setShowReason] = useState<number | null>(null);
  const assumptions = bundle?.config.assumptions ?? [];
  const filtered = assumptions.filter((item) => (!rule || item.decision_rule === rule) && (!search || `${item.path} ${item.reason} ${item.planner_fallback}`.toLowerCase().includes(search.toLowerCase())));
  const variables = Object.entries(bundle?.manifest.data.power.variables ?? {});
  return (
    <div className="data-layout">
      <header className="page-heading"><h1 id="view-heading">Method and data</h1><p>Each rotation that meets the constraints is evaluated against water demand, soil health and climate risk. With the same inputs and data, the engine returns the same ranking.</p></header>
      {!bundle ? <DataUnavailable error={error} retry={retry} /> : null}
      <section className="content-section"><h2>How a plan is produced</h2><p className="section-description">Inputs are kept with their origin and evidence before the in-browser calculation returns ranked rotations.</p><PipelineDiagram /><ol><li>Daily climate snapshots and vegetation composites are loaded with the region data.</li><li>Crop settings are supplied with evidence grades and assumptions.</li><li>The browser calculation engine compares rotations and records its limits.</li><li>Ranked plans retain their indicator values and provenance.</li></ol></section>
      <section className="content-section"><h2>Data</h2>{bundle ? <><p>Time standard: {bundle.manifest.data.time_standard}. Latest available data through {formatDate(bundle.manifest.data.end_date)}.</p><DataTable headers={["Variable", "Unit", "Label", "Source", "Resolution"]} rows={[...variables.map(([key, item]) => [POWER_VARIABLE_LABELS[key] ?? key, item.unit, <LabelChip key={key} label={item.label} />, item.source, medianCadence([]) ?? "Daily"]), ["Vegetation index", "NDVI", <LabelChip key="ndvi-label" label="observed" />, bundle.manifest.data.ndvi.product, "Composite interval not available"]]} /><h3 className="section-block">Point grid cells</h3><DataTable headers={["Point", "Area", "Cell id", "Shares cell with"]} rows={PROPOSED_POINTS.map((point) => { const real = bundle.points.points.find((item) => item.id === point.id); const group = bundle.manifest.data.cell_groups.cells.find((item) => item.cell_id === real?.cell_id); return [point.id, real?.area ?? point.area, real?.cell_id ?? "not available", (group?.point_ids ?? []).filter((id) => id !== point.id).join(", ") || "None listed"]; })} />{bundle.manifest.data.cell_groups.inference ? <p>{bundle.manifest.data.cell_groups.inference}</p> : null}</> : <p>Bundle files are not available.</p>}</section>
      <section className="content-section"><h2>Parameter evidence</h2>{bundle ? <><div className="stats-row">{(["verified", "provisional", "unresolved"] as const).map((grade) => <dl key={grade} className="stat-item"><dt><GradeChip grade={grade} /></dt><dd>{formatNullable(bundle.manifest.config.parameter_counts[grade])}</dd></dl>)}</div><p className="section-description">Verified values were read in an opened source. Provisional values are unconfirmed and treated as assumptions. Unresolved values have no confirmed source and use a documented fallback.</p><p>{Object.values(bundle.manifest.config.parameter_counts).reduce((sum, value) => sum + value, 0)} parameters across {Object.keys(bundle.config.crops).length} crops, {bundle.manifest.config.assumption_count} assumptions recorded, {bundle.manifest.config.source_count} sources listed.</p></> : <p>Evidence totals are not shown without the original configuration and manifest.</p>}</section>
      <section className="content-section"><h2>Assumptions</h2>{bundle ? <><div className="method-filter-row"><label className="field-block"><span className="field-label">Search assumptions</span><input className="search-input" value={search} onChange={(event) => setSearch(event.target.value)} /></label><label className="field-block"><span className="field-label">Decision rule</span><select className="select-input" value={rule} onChange={(event) => setRule(event.target.value)}><option value="">All rules</option>{[...new Set(assumptions.map((item) => item.decision_rule))].sort().map((value) => <option key={value} value={value}>{value}</option>)}</select></label></div><p className="notice-text" role="status">{filtered.length} assumptions.</p>{filtered.length ? <DataTable headers={["Path", "Rule", "Reason", "Fallback"]} rows={filtered.slice(0, 25).map((item, index) => [<code key={item.path}>{item.path}</code>, item.decision_rule, <>{item.reason}<Button variant="quiet" onClick={() => setShowReason(showReason === index ? null : index)}>{showReason === index ? "Hide reason" : "Show reason"}</Button></>, item.planner_fallback])} /> : <p>No assumptions match {search}. Clear the search.</p>}</> : <p>Assumptions are not available without the supplied crop configuration.</p>}</section>
      <section className="content-section"><h2>Limits</h2>{loading ? <p>Loading the engine limits.</p> : response?.limits.length ? <ul>{response.limits.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>The engine and its limits statement have not been supplied.</p>}<p className="section-description">Climate values are cell-scale model output, not field measurements.</p></section>
      <section className="content-section"><h2>Sources</h2>{bundle?.config.sources.length ? bundle.config.sources.map((source) => <div className="source-row" key={source.id} id={`source-${source.id}`}><h3>{source.id}</h3><p>{source.citation}</p><p className="provenance-ref">{source.url_or_doi}</p><p>{source.date_opened}. {source.access_status}.</p>{source.url_or_doi.startsWith("http") ? <a href={source.url_or_doi} target="_blank" rel="noopener noreferrer">Open source {source.id}</a> : null}</div>) : <p>No source records were supplied.</p>}</section>
      <section className="content-section"><h2>Data version</h2>{bundle ? <p>Bundle {bundle.manifest.bundle_version}, built {formatDate(bundle.manifest.built_at_utc)}. Engine {response?.engine_version ?? "not supplied"}. {bundle.manifest.files.length} manifest files.</p> : <p>Data version details are unavailable.</p>}</section>
      {response ? <Button onClick={() => openEvidence({ title: "Indicator details", detail: "Open a plan value to inspect its evidence.", plan: response.plans[0] })}>Evidence details</Button> : null}
    </div>
  );
}

function PipelineDiagram() {
  return <svg className="pipeline" viewBox="0 0 900 150" role="img" aria-label="Climate and vegetation snapshots plus crop settings flow into the calculation engine and then produce ranked plans"><title>Plan calculation sequence</title><desc>Data and configuration inputs are evaluated by the browser engine to produce ranked plans with evidence.</desc><defs><marker id="pipeline-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="var(--rim-strong)" /></marker></defs><rect x="22" y="32" width="185" height="78" rx="8" /><text x="38" y="62">Climate snapshots</text><text x="38" y="88">Vegetation composites</text><line x1="207" x2="310" y1="72" y2="72" markerEnd="url(#pipeline-arrow)" /><rect className="engine-node" x="316" y="32" width="195" height="78" rx="8" /><text x="338" y="62">Crop configuration</text><text x="338" y="88">Calculation engine</text><line x1="511" x2="614" y1="72" y2="72" markerEnd="url(#pipeline-arrow)" /><rect x="620" y="32" width="250" height="78" rx="8" /><text x="642" y="62">Ranked plans</text><text x="642" y="88">with evidence</text></svg>;
}

function GlobalView({ bundle, error, retry }: { bundle: ActualBundle | null; error: BundleError | null; retry: () => void }) {
  return <div className="data-layout"><header className="page-heading"><h1 id="view-heading">Other river basins</h1><p>RotaNile is demonstrated for the Nile Delta only. It has not been validated in any other basin, and no claim is made that the results would be usable there.</p></header><section className="content-section"><h2>What a region pack contains</h2><p>A region pack describes points, climate and vegetation snapshots, crop settings and their source register.</p><div className="tree-block">{REGION_FILES.map((path) => <div className="tree-line" key={path}>{path}</div>)}</div></section><section className="content-section"><h2>Schemas involved</h2><div className="table-wrap"><table className="data-table"><thead><tr><th scope="col">File</th><th scope="col">Schema</th><th scope="col">What it checks</th></tr></thead><tbody>{SCHEMA_ROWS.map(([file, schema, what]) => <tr key={file}><td>{file}</td><td>{schema}</td><td>{what}</td></tr>)}</tbody></table></div></section><section className="content-section"><h2>What can be replaced</h2><ul><li>The points, climate snapshots and vegetation snapshots.</li><li>The five crop parameters, ranges, units, sources and evidence grades.</li><li>The season month lists, rotation rules, assumptions and source register.</li></ul></section><section className="content-section"><h2>What needs an engine change</h2><ul><li>The crop set: wheat, berseem, cotton, maize and rice.</li><li>The winter and summer seasons.</li><li>The climate variable set and units.</li><li>The three-year, six-season horizon.</li></ul></section><section className="content-section"><h2>What to expect</h2><ul><li>A new region will usually have more provisional or unresolved settings than the Nile Delta pack.</li><li>Each provisional or unresolved parameter needs a recorded assumption.</li><li>Each coordinate must be checked on imagery before release.</li></ul></section>{!bundle ? <DataUnavailable error={error} retry={retry} /> : null}</div>;
}

function AboutView({ bundle, response }: { bundle: ActualBundle | null; response: EngineResponse | null }) {
  return <div className="data-layout"><header className="page-heading"><h1 id="view-heading">About RotaNile</h1></header><section className="content-section"><p>RotaNile is built by Nile Orbit Lab.</p><p>It is an entry to a space-applications competition, using satellite-derived and model data to support crop-rotation planning in the Nile Delta.</p><p>For five proposed points in the Delta, it combines daily climate snapshots, vegetation composites and crop settings with graded evidence. A deterministic engine is intended to rank three-year rotations on water demand, soil health and climate risk, and every number carries a label and an evidence grade.</p></section><section className="content-section"><h2>What it does not do</h2><ul><li>It does not forecast yields or weather.</li><li>It does not model income or costs.</li><li>It has not been validated against field trials or reviewed by agronomists.</li><li>It is demonstrated for the Nile Delta only.</li><li>It does not use real-time data; the data are the latest available at the build date.</li></ul></section><section className="content-section"><h2>Data version</h2><p>Bundle {bundle?.manifest.bundle_version ?? "not supplied"}. Engine {response?.engine_version ?? "not supplied"}. Latest available data through {bundle?.manifest.data.end_date ? formatDate(bundle.manifest.data.end_date) : "date not supplied"}.</p></section></div>;
}

export function RotaNileApp() {
  const [section, setSection] = useState<ViewSection>("/");
  const [bundle, setBundle] = useState<ActualBundle | null>(null);
  const [bundleError, setBundleError] = useState<BundleError | null>(null);
  const [drawer, setDrawer] = useState<EvidenceContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [response, setResponse] = useState<EngineResponse | null>(null);
  const loadedBundleRef = useRef<ActualBundle | null>(null);

  const loadBundle = useCallback(async () => {
    setLoading(true);
    try {
      const [pointsResponse, configResponse, manifestResponse] = await Promise.all([
        fetch(`${DATA_BASE}points.json`),
        fetch(`${DATA_BASE}config.json`),
        fetch(`${DATA_BASE}manifest.json`),
      ]);
      const missing = [["points.json", pointsResponse], ["config.json", configResponse], ["manifest.json", manifestResponse]].find(([, result]) => !(result as Response).ok);
      if (missing) throw { kind: "bundle_missing", file: String(missing[0]), detail: `Missing ${String(missing[0])}. Add the approved data bundle under public/data.` };
      const [points, config, manifest] = await Promise.all([pointsResponse.json(), configResponse.json(), manifestResponse.json()]) as [ActualBundle["points"], ActualBundle["config"], ActualBundle["manifest"]];
      if (!Array.isArray(points.points) || !config.crops || !manifest.data?.end_date) throw { kind: "bundle_invalid", file: "points.json, config.json or manifest.json", detail: "Required bundle fields are missing." };
      const ndviEntries = await Promise.all(points.points.map(async (point) => {
        const result = await fetch(`${DATA_BASE}ndvi/${point.id}.json`);
        if (!result.ok) throw { kind: "bundle_missing", file: `ndvi/${point.id}.json`, detail: `The vegetation record for ${point.area} was not supplied.` };
        return [point.id, await result.json() as NdviFile] as const;
      }));
      const next: ActualBundle = { points, config, manifest, ndvi: Object.fromEntries(ndviEntries) };
      setBundle(next);
      loadedBundleRef.current = next;
      setBundleError(null);
    } catch (error) {
      const typed = (error ?? {}) as BundleError;
      setBundleError({ kind: typed.kind ?? "network", detail: typed.detail ?? "The data could not be read.", ...(typed.file ? { file: typed.file } : {}) });
      setBundle(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBundle(); }, [loadBundle, retryCount]);

  useEffect(() => {
    const readHash = () => {
      const { section: next } = parsePlannerHash(window.location.hash);
      setSection(next as ViewSection);
      const region = document.getElementById("polite-status");
      if (region) region.textContent = `${NAVIGATION_ITEMS.find((item) => item.path === next)?.label ?? "Planner"} page`;
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const retry = useCallback(() => setRetryCount((count) => count + 1), []);
  const openEvidence = useCallback((context: EvidenceContext) => setDrawer(context), []);
  const commonProps = useMemo(() => ({ bundle, response, openEvidence, retry, loading, error: bundleError }), [bundle, response, openEvidence, retry, loading, bundleError]);

  return (
    <Shell section={section}>
      {section === "/" ? <PlannerView bundle={bundle} error={bundleError} retry={retry} openEvidence={openEvidence} /> : null}
      {section === "/method" ? <Suspense fallback={<p className="chart-wrap">Loading method and data.</p>}><LazyMethodView {...commonProps} /></Suspense> : null}
      {section === "/global" ? <Suspense fallback={<p className="chart-wrap">Loading region information.</p>}><LazyGlobalView bundle={bundle} error={bundleError} retry={retry} /></Suspense> : null}
      {section === "/about" ? <Suspense fallback={<p className="chart-wrap">Loading project information.</p>}><LazyAboutView bundle={bundle} response={response} /></Suspense> : null}
      <EvidenceDrawer context={drawer} bundle={bundle} onClose={() => setDrawer(null)} />
    </Shell>
  );
}