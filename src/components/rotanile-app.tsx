import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  Button,
  CropCell,
  DataTable,
  Field,
  GradeChip,
  InlineMessage,
  LabelChip,
} from "@/components/ui/pieces";
import { PageHero, Shell } from "@/components/layout";
import { DataLoading, DataProblem, DataSourceLine, LocationIssues } from "@/components/data-status";
import { CROP_LIST, NAVIGATION_ITEMS } from "@/lib/app-content";
import { directServices } from "@/lib/data/services";
import { createBundleLoader, type BundleLoader, type LoadState } from "@/lib/data/loader";
import { runPlanner } from "@/lib/planner";
import { encodePlannerHash, ndviNote, normalizeWeights, parsePlannerHash } from "@/lib/derive";
import { formatDate, formatNullable, scoreFormatter } from "@/lib/format";
import type {
  CropId,
  EngineRequest,
  EngineResponse,
  NdviFile,
  Plan,
  Priorities,
  ProvenanceEntry,
} from "@/lib/contract";
import type { ActualBundle, BundleError, DataMode, EvidenceContext } from "@/lib/app-types";

type ViewSection = "/" | "/method" | "/global" | "/about";

const LazyMethodView = lazy(() => import("@/views/method-view"));
const LazyGlobalView = lazy(() => import("@/views/global-view"));
const LazyAboutView = lazy(() => import("@/views/about-view"));

function showIndicatorLabel(key: string) {
  return key === "water_demand_mm_total"
    ? "Water demand over six seasons"
    : key === "soil_health_index"
      ? "Soil health"
      : "Climate risk";
}

function EvidenceButton({ onOpen }: { onOpen: () => void }) {
  return (
    <Button variant="quiet" onClick={onOpen}>
      Evidence details
    </Button>
  );
}

function cellPeers(bundle: ActualBundle, pointId: string) {
  const cellId = bundle.manifest.data.cell_groups.point_to_cell[pointId];
  const cell = bundle.manifest.data.cell_groups.cells.find((item) => item.cell_id === cellId);
  return (cell?.point_ids ?? []).filter((id) => id !== pointId);
}

function cropName(id: CropId) {
  return CROP_LIST.find((item) => item.id === id)?.name ?? id;
}

function describeNdvi(file: NdviFile | undefined) {
  if (!file) return "NDVI loading";
  const note = ndviNote(file);
  return note
    ? `NDVI ${formatNullable(note.value, 2)} on ${formatDate(note.date)}`
    : "No valid NDVI";
}

function areaName(bundle: ActualBundle, id: string) {
  return bundle.points.points.find((point) => point.id === id)?.area ?? id;
}

function PlannerView({
  bundle,
  loadState,
  retry,
  retryPoint,
  retryVegetation,
  openEvidence,
  onResponse,
}: {
  onResponse: (response: EngineResponse | null) => void;
  bundle: ActualBundle | null;
  loadState: LoadState;
  retry: () => void;
  retryPoint: (id: string) => void;
  retryVegetation: (id: string) => void;
  openEvidence: (context: EvidenceContext) => void;
}) {
  const dataMode: DataMode | null = loadState.phase === "ready" ? loadState.mode : null;
  const retrievedAt = loadState.phase === "ready" ? loadState.retrievedAt : null;
  const locations =
    loadState.phase === "ready" || loadState.phase === "loading" ? loadState.locations : [];
  const usablePoints = (bundle?.points.points ?? []).filter((point) => !!bundle?.climate[point.id]);
  const [parsed, setParsed] = useState(() => parsePlannerHash("#/"));
  const [selectedPoint, setSelectedPoint] = useState(parsed.pointId ?? "");
  const [weights, setWeights] = useState(parsed.priorities);
  const [salinity, setSalinity] = useState(parsed.salinity === null ? "" : String(parsed.salinity));
  const [cap, setCap] = useState(parsed.waterCap === null ? "" : String(parsed.waterCap));
  const [enabledCrops, setEnabledCrops] = useState<string[] | null>(parsed.allowedCrops);
  const [hashReady, setHashReady] = useState(false);
  const [chartMode, setChartMode] = useState<"chart" | "table">("table");
  const [filter, setFilter] = useState("");
  const [sortBy, setSortBy] = useState("rank");
  const [page, setPage] = useState(0);
  const [expandedPointInputs, setExpandedPointInputs] = useState(true);
  const [response, setResponse] = useState<EngineResponse | null>(null);
  const [engineMessage, setEngineMessage] = useState<string | null>(null);
  const [salinityError, setSalinityError] = useState("");
  const [capError, setCapError] = useState("");
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(parsed.planId);
  const [resultsState, setResultsState] = useState<"idle" | "loading" | "ready" | "empty">("idle");
  const runCount = useRef(0);
  const priorityTotal = weights.water + weights.soil_health + weights.climate_risk;
  const normalizedWeights =
    priorityTotal > 0
      ? {
          water: weights.water / priorityTotal,
          soil_health: weights.soil_health / priorityTotal,
          climate_risk: weights.climate_risk / priorityTotal,
        }
      : null;

  useEffect(() => {
    const next = parsePlannerHash(window.location.hash);
    setParsed(next);
    setSelectedPoint(next.pointId ?? "");
    setWeights(next.priorities);
    setSalinity(next.salinity === null ? "" : String(next.salinity));
    setCap(next.waterCap === null ? "" : String(next.waterCap));
    setEnabledCrops(next.allowedCrops);
    setSelectedPlanId(next.planId);
    setHashReady(true);
  }, []);

  useEffect(() => {
    if (!bundle) return;
    const available = new Set(
      bundle.points.points.filter((point) => !!bundle.climate[point.id]).map((point) => point.id),
    );
    if (!selectedPoint || !available.has(selectedPoint)) setSelectedPoint([...available][0] ?? "");
    if (!enabledCrops) setEnabledCrops([...CROP_LIST.map((crop) => crop.id)]);
  }, [bundle, enabledCrops, selectedPoint]);

  useEffect(() => {
    if (priorityTotal <= 0) {
      return;
    }
    const priorities = normalizeWeights(weights);
    if (!bundle || !selectedPoint || !priorities) return;
    const nextRun = ++runCount.current;
    const request: EngineRequest = {
      point_id: selectedPoint,
      horizon_years: 3,
      priorities,
      soil: { salinity_ec_dsm: salinity === "" ? null : Number(salinity) },
      constraints: {
        allowed_crops:
          enabledCrops === null || enabledCrops.length === CROP_LIST.length
            ? null
            : (enabledCrops as CropId[]),
        max_share_by_crop: null,
        seasonal_water_cap_mm: cap === "" ? null : Number(cap),
      },
    };
    setResultsState("loading");
    setEngineMessage(null);
    const timer = window.setTimeout(
      () => {
        void runPlanner(request, bundle)
          .then((result) => {
            if (runCount.current !== nextRun) return;
            setResponse(result);
            onResponse(result);
            setSelectedPlanId((current) =>
              result.plans.some((plan) => plan.id === current)
                ? current
                : (result.top_ids[0] ?? result.plans[0]?.id ?? null),
            );
            setResultsState(result.plans.length ? "ready" : "empty");
          })
          .catch((reason: unknown) => {
            if (runCount.current !== nextRun) return;
            const detail =
              reason !== null && typeof reason === "object" && "detail" in reason
                ? String(reason.detail)
                : "The calculation could not run.";
            setResponse(null);
            setEngineMessage(detail);
            setResultsState("empty");
          });
      },
      runCount.current === 1 ? 0 : 300,
    );
    return () => {
      window.clearTimeout(timer);
      runCount.current += 1;
    };
  }, [bundle, selectedPoint, weights, salinity, cap, enabledCrops, priorityTotal, onResponse]);

  const updateHash = useCallback(
    (planId: string | null) => {
      if (!hashReady || typeof window === "undefined") return;
      const next = encodePlannerHash("/", {
        pointId: selectedPoint || null,
        priorities: weights,
        salinity: salinity === "" ? null : Number(salinity),
        allowedCrops:
          enabledCrops && enabledCrops.length !== CROP_LIST.length ? enabledCrops : null,
        waterCap: cap === "" ? null : Number(cap),
        planId,
      });
      if (window.location.hash !== next) window.history.replaceState(null, "", next);
    },
    [hashReady, selectedPoint, weights, salinity, enabledCrops, cap],
  );

  useEffect(() => {
    if (hashReady) updateHash(selectedPlanId);
  }, [hashReady, updateHash, selectedPlanId]);

  const noSeasonWarning =
    enabledCrops !== null &&
    (!enabledCrops.some((id) =>
      CROP_LIST.some((crop) => crop.id === id && crop.season === "winter"),
    ) ||
      !enabledCrops.some((id) =>
        CROP_LIST.some((crop) => crop.id === id && crop.season === "summer"),
      ));

  const currentPlan = response?.plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const rankedPlans = (response?.top_ids ?? [])
    .map((id) => response?.plans.find((plan) => plan.id === id))
    .filter((plan): plan is Plan => !!plan);
  const planTableRows = (response?.plans ?? [])
    .filter(
      (plan) =>
        filter === "" ||
        String(plan.rank).includes(filter) ||
        plan.id.toLowerCase().includes(filter.toLowerCase()),
    )
    .slice()
    .sort((a, b) =>
      sortBy === "water"
        ? a.indicators.water_demand_mm_total.value - b.indicators.water_demand_mm_total.value
        : sortBy === "score"
          ? b.score - a.score
          : a.rank - b.rank,
    );
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
      <PageHero
        title={
          <>
            <span className="hero-kicker">Rotation plans for</span> {selectedArea}
          </>
        }
      >
        {bundle ? (
          <DataSourceLine bundle={bundle} mode={dataMode} retrievedAt={retrievedAt} />
        ) : (
          <p className="hero-lede">Five proposed points in the Nile Delta, seen from orbit.</p>
        )}
        {resultsState === "loading" ? (
          <p className="sr-only" role="status">
            Loading plans.
          </p>
        ) : null}
      </PageHero>

      {parsed.invalid ? (
        <InlineMessage
          title="Some URL inputs were ignored"
          detail="Review the values you entered and set them again."
          variant="warning"
        />
      ) : null}
      {loadState.phase === "loading" ? <DataLoading state={loadState} /> : null}
      {loadState.phase === "config_missing" || loadState.phase === "failed" ? (
        <DataProblem state={loadState} retry={retry} />
      ) : null}
      {loadState.phase === "ready" ? (
        <LocationIssues
          locations={locations}
          retryPoint={retryPoint}
          retryVegetation={retryVegetation}
        />
      ) : null}
      {loadState.phase === "ready" && loadState.notices.length ? (
        <InlineMessage title="Data notice" detail={loadState.notices.join(" ")} variant="warning" />
      ) : null}

      {bundle ? (
        <div className="planner-layout">
          <aside className="input-rail" aria-label="Planner inputs">
            <div className="point-input-disclosure">
              <Button
                variant="secondary"
                aria-expanded={expandedPointInputs}
                onClick={() => setExpandedPointInputs((open) => !open)}
              >
                Change inputs
              </Button>
            </div>
            <div className="input-stack" hidden={!expandedPointInputs}>
              <section aria-labelledby="point-choice-title">
                <h2 className="section-heading" id="point-choice-title">
                  Choose a point
                </h2>
                <p className="field-hint">Proposed coordinates, not checked on imagery.</p>
                <div className="point-list" role="radiogroup" aria-label="Nile Delta points">
                  {usablePoints.map((point) => (
                    <button
                      key={point.id}
                      className="point-choice"
                      type="button"
                      role="radio"
                      aria-checked={selectedPoint === point.id}
                      tabIndex={selectedPoint === point.id ? 0 : -1}
                      onClick={() => setSelectedPoint(point.id)}
                      onKeyDown={(event) => {
                        const index = usablePoints.findIndex(
                          (candidate) => candidate.id === selectedPoint,
                        );
                        const move =
                          event.key === "ArrowDown" || event.key === "ArrowRight"
                            ? 1
                            : event.key === "ArrowUp" || event.key === "ArrowLeft"
                              ? -1
                              : 0;
                        if (move !== 0) {
                          event.preventDefault();
                          const next =
                            usablePoints[
                              (index + move + usablePoints.length) % usablePoints.length
                            ];
                          if (next) setSelectedPoint(next.id);
                        }
                      }}
                    >
                      <span className="point-orb" aria-hidden="true" />
                      <span className="point-text">
                        <strong>{point.area}</strong>
                        <span className="point-meta">{describeNdvi(bundle.ndvi[point.id])}</span>
                        {cellPeers(bundle, point.id).length ? (
                          <span className="point-meta">
                            Same climate cell as{" "}
                            {cellPeers(bundle, point.id)
                              .map((id) => areaName(bundle, id))
                              .join(", ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-labelledby="priorities-title">
                <h2 className="section-heading" id="priorities-title">
                  Set your priorities
                </h2>
                {(
                  [
                    ["water", "Water", "Less irrigation"],
                    ["soil_health", "Soil health", "Better nitrogen and rotation record"],
                    ["climate_risk", "Climate risk", "Less heat and water stress"],
                  ] as const
                ).map(([key, label, hint]) => (
                  <div className="field-block" key={key}>
                    <div className="range-heading">
                      <label className="field-label" htmlFor={`weight-${key}`}>
                        {label}
                      </label>
                      <span className="range-value">
                        {formatNullable((normalizedWeights?.[key] ?? 0) * 100)}%
                      </span>
                    </div>
                    <input
                      className="range-field"
                      id={`weight-${key}`}
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={weights[key]}
                      aria-valuetext={`${formatNullable((normalizedWeights?.[key] ?? 0) * 100)} percent of total priority`}
                      onChange={(event) =>
                        setWeights((current) => ({ ...current, [key]: Number(event.target.value) }))
                      }
                    />
                    <span className="field-hint">{hint}</span>
                  </div>
                ))}
                {normalizedWeights ? null : (
                  <InlineMessage title="Set at least one priority above zero." variant="error" />
                )}
              </section>

              <section aria-labelledby="soil-title">
                <h2 className="section-heading" id="soil-title">
                  Soil
                </h2>
                <Field
                  inputId="salinity"
                  label="Soil salinity"
                  optional
                  unit="dS/m"
                  hint="Leave empty if unknown."
                  error={salinityError}
                >
                  <input
                    id="salinity"
                    className="number-input"
                    inputMode="decimal"
                    value={salinity}
                    onChange={(event) => setSalinity(event.target.value)}
                    onBlur={() =>
                      setSalinityError(
                        salinity !== "" &&
                          (!Number.isFinite(Number(salinity)) || Number(salinity) < 0)
                          ? "Enter 0 or a positive number, for example 2.5."
                          : "",
                      )
                    }
                    aria-describedby="salinity-error"
                  />
                </Field>
              </section>

              <section aria-labelledby="constraints-title">
                <h2 className="section-heading" id="constraints-title">
                  Constraints
                </h2>
                <div className="crop-toggles" role="group" aria-label="Allowed crops">
                  {CROP_LIST.map((crop) => {
                    const active = (enabledCrops ?? CROP_LIST.map((item) => item.id)).includes(
                      crop.id,
                    );
                    return (
                      <button
                        key={crop.id}
                        className="crop-toggle"
                        type="button"
                        role="switch"
                        aria-checked={active}
                        onClick={() => toggleCrop(crop.id)}
                      >
                        <span className="crop-chip" style={{ backgroundColor: crop.color }}>
                          {crop.letter}
                        </span>
                        {crop.name}
                      </button>
                    );
                  })}
                </div>
                {noSeasonWarning ? (
                  <InlineMessage
                    title="Plans need at least one winter crop and one summer crop."
                    variant="warning"
                  />
                ) : null}
                <Field
                  inputId="seasonal-cap"
                  label="Seasonal water cap"
                  optional
                  unit="mm per season"
                  hint="Drops plans above this in any season."
                  error={capError}
                >
                  <input
                    id="seasonal-cap"
                    className="number-input"
                    inputMode="decimal"
                    value={cap}
                    onChange={(event) => setCap(event.target.value)}
                    onBlur={() =>
                      setCapError(
                        cap !== "" && (!Number.isFinite(Number(cap)) || Number(cap) < 0)
                          ? "Enter 0 or a positive number."
                          : "",
                      )
                    }
                    aria-describedby="seasonal-cap-error"
                  />
                </Field>
                <Button variant="quiet" onClick={reset}>
                  Reset inputs
                </Button>
              </section>
            </div>
          </aside>

          <div className="planner-results" aria-busy={resultsState === "loading"}>
            {engineMessage ? (
              <InlineMessage
                title="No plans for these inputs"
                detail={engineMessage}
                variant="warning"
              />
            ) : null}
            <section aria-labelledby="plans-title">
              <h2 className="sr-only" id="plans-title">
                Ranked plans
              </h2>
              {resultsState === "loading" && !response ? (
                <div className="plan-skeleton" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
              {rankedPlans.length > 0 ? (
                <div
                  className={`plan-stack${resultsState === "loading" ? " is-updating" : ""}`}
                  key={response?.request.point_id}
                >
                  {rankedPlans[0] ? (
                    <PlanCard
                      plan={rankedPlans[0]}
                      lead
                      onSelect={choosePlan}
                      selected={selectedPlanId === rankedPlans[0].id}
                      onEvidence={() => {
                        const plan = rankedPlans[0];
                        if (plan)
                          openEvidence({
                            title: `Rank ${plan.rank} evidence`,
                            detail: "Plan evidence and source records.",
                            plan,
                          });
                      }}
                    />
                  ) : null}
                  <div className="plan-pair">
                    {rankedPlans.slice(1).map((plan) => (
                      <PlanCard
                        key={plan.id}
                        plan={plan}
                        onSelect={choosePlan}
                        selected={selectedPlanId === plan.id}
                        onEvidence={() =>
                          openEvidence({
                            title: `Rank ${plan.rank} evidence`,
                            detail: "Plan evidence and source records.",
                            plan,
                          })
                        }
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              {response && response.plans.length === 0 && !engineMessage ? (
                <InlineMessage
                  title="No plans returned"
                  detail="The calculation finished but no plan met these inputs."
                  variant="warning"
                />
              ) : null}
            </section>

            {response ? (
              <section aria-labelledby="pareto-heading">
                <h2 id="pareto-heading">How the plans trade off</h2>
                {response ? (
                  <>
                    <div className="control-row view-tabs">
                      <Button
                        aria-pressed={chartMode === "chart"}
                        onClick={() => setChartMode("chart")}
                      >
                        Show chart
                      </Button>
                      <Button
                        aria-pressed={chartMode === "table"}
                        onClick={() => setChartMode("table")}
                      >
                        Show as table
                      </Button>
                    </div>
                    {chartMode === "table" ? (
                      <PlanTable
                        plans={pageRows}
                        total={planTableRows.length}
                        page={page}
                        setPage={setPage}
                        pageCount={pageCount}
                        filter={filter}
                        setFilter={setFilter}
                        sortBy={sortBy}
                        setSortBy={setSortBy}
                        onSelect={choosePlan}
                      />
                    ) : (
                      <PlanChart
                        plans={response.plans}
                        frontIds={response.pareto_front_ids}
                        selectedPlan={currentPlan}
                        onSelect={choosePlan}
                      />
                    )}
                    {response.plans.length < 3 ? (
                      <InlineMessage
                        title={`Only ${response.plans.length} plans meet your constraints.`}
                        variant="warning"
                      />
                    ) : null}
                  </>
                ) : null}
              </section>
            ) : null}

            {response ? (
              <section aria-labelledby="selected-plan-heading">
                <h2 id="selected-plan-heading">Selected plan, season by season</h2>
                {currentPlan ? (
                  <SelectedPlanTable
                    plan={currentPlan}
                    onEvidence={() =>
                      openEvidence({
                        title: `Rank ${currentPlan.rank} evidence`,
                        detail: "Plan evidence and source records.",
                        plan: currentPlan,
                      })
                    }
                    onFigure={(detail) =>
                      openEvidence({ title: "Season evidence", detail, plan: currentPlan })
                    }
                    salinity={salinity}
                  />
                ) : (
                  <p className="muted">Select a plan to see its seasons.</p>
                )}
              </section>
            ) : null}

            <section aria-labelledby="ndvi-heading">
              <h2 id="ndvi-heading">Vegetation at {selectedArea}</h2>
              <p className="section-description">
                <LabelChip label="observed" /> MODIS NDVI, context only. Not used in scores.
              </p>
              {activeNdvi ? (
                <NdviView
                  file={activeNdvi}
                  onEvidence={() =>
                    openEvidence({
                      title: "Vegetation record",
                      detail: "Product details and composite counts.",
                      pointId: selectedPoint,
                    })
                  }
                />
              ) : (
                <div className="chart-wrap">
                  <p className="muted">Vegetation record is still loading for {selectedArea}.</p>
                </div>
              )}
            </section>

            <section aria-labelledby="limits-heading" className="limits-strip">
              <h2 id="limits-heading" className="sr-only">
                Limits
              </h2>
              <p>
                Planning support, not a forecast. Nile Delta only; real-world validation was not
                performed. <a href="#/method">Read the limits</a>
              </p>
              {response?.warnings.length ? (
                <ul>
                  {response.warnings.map((item, index) => (
                    <li key={`${index}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PlanCard({
  plan,
  lead = false,
  selected,
  onSelect,
  onEvidence,
}: {
  plan: Plan;
  lead?: boolean;
  selected: boolean;
  onSelect: (plan: Plan) => void;
  onEvidence: () => void;
}) {
  return (
    <article
      className={`plan-card ${lead ? "lead" : ""} ${selected ? "selected" : ""}`}
      aria-current={selected ? "true" : undefined}
    >
      <button
        className="plan-header"
        type="button"
        aria-label={`Select rank ${plan.rank} plan`}
        onClick={() => onSelect(plan)}
      >
        <h3>Rank {plan.rank}</h3>
        <span className="score">Score {scoreFormatter.format(plan.score)}</span>
        <span className="muted">out of 1</span>
      </button>
      {plan.pareto ? <p className="notice-text">On the trade-off front.</p> : null}
      <div className="year-sequence" aria-label="Three-year rotation">
        {[1, 2, 3].map((year) => (
          <div className="year-pair" key={year}>
            <span className="year-label">Year {year}</span>
            <div className="year-cells">
              {plan.slots
                .filter((slot) => slot.year === year)
                .map((slot) => (
                  <CropCell
                    key={`${slot.year}-${slot.season}`}
                    cropId={slot.crop_id}
                    label={`Year ${year}, ${slot.season}`}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
      <div className="indicator-list">
        {(
          Object.entries(plan.indicators) as [string, Plan["indicators"]["water_demand_mm_total"]][]
        ).map(([key, value]) => (
          <div className="indicator-item" key={key}>
            <div className="indicator-title">
              <strong>{showIndicatorLabel(key)}</strong>
              <span>
                {formatNullable(value.value, key === "water_demand_mm_total" ? 0 : 2)} {value.unit}
                <span className="muted">
                  {" "}
                  {value.uncertainty
                    ? `(${formatNullable(value.uncertainty.low, key === "water_demand_mm_total" ? 0 : 2)} to ${formatNullable(value.uncertainty.high, key === "water_demand_mm_total" ? 0 : 2)})`
                    : "(range not assessed)"}
                </span>
              </span>
            </div>
            <div
              className="indicator-track"
              aria-label={`${showIndicatorLabel(key)}, relative position ${scoreFormatter.format(value.normalized)}`}
            >
              <span
                className="indicator-tick"
                style={{ left: `${Math.max(0, Math.min(100, value.normalized * 100))}%` }}
              />
            </div>
            <div className="track-ends">
              <span>Worse</span>
              <span>Better</span>
            </div>
          </div>
        ))}
      </div>
      {lead ? (
        <p className="field-hint">
          Position shows how a plan compares with the other plans that meet your constraints, not an
          absolute score.
        </p>
      ) : null}
      <div className="evidence-line">
        <GradeChip grade={plan.evidence.weakest_grade} />
        {[...new Set(plan.provenance.map((item) => item.label))].map((label) => (
          <LabelChip key={label} label={label} />
        ))}
        <EvidenceButton onOpen={onEvidence} />
      </div>
      <details className="disclosure" open={lead}>
        <summary>Why this plan</summary>
        <p className="field-hint">
          Ranked {plan.rank}. The engine’s explanation is limited to the fields included in this
          plan and its evidence record.
        </p>
      </details>
    </article>
  );
}

function PlanChart({
  plans,
  frontIds,
  selectedPlan,
  onSelect,
}: {
  plans: Plan[];
  frontIds: string[];
  selectedPlan: Plan | null;
  onSelect: (plan: Plan) => void;
}) {
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
  const sorted = [...plans].sort(
    (a, b) => a.indicators.water_demand_mm_total.value - b.indicators.water_demand_mm_total.value,
  );
  const front = frontIds
    .map((id) => plans.find((plan) => plan.id === id))
    .filter((plan): plan is Plan => !!plan)
    .sort(
      (a, b) => a.indicators.water_demand_mm_total.value - b.indicators.water_demand_mm_total.value,
    );
  const x = (plan: Plan) =>
    left +
    ((plan.indicators.water_demand_mm_total.value - min + padding) / (max - min + padding * 2)) *
      plotWidth;
  const y = (plan: Plan) => top + (1 - plan.indicators.soil_health_index.value) * plotHeight;
  const linePath = front
    .map(
      (plan, index) => `${index === 0 ? "M" : "H"} ${x(plan)} ${index === 0 ? `V ${y(plan)}` : ""}`,
    )
    .join(" ");

  return (
    <div className="chart-wrap">
      {plans.length === 0 ? (
        <p>No plans to plot. Change the constraints or the point.</p>
      ) : (
        <>
          <p className="chart-summary">
            {plans.length} plans, {front.length} on the trade-off front. Water demand ranges from{" "}
            {formatNullable(min)} to {formatNullable(max)} mm. Soil health is shown from 0 to 1.
          </p>
          <svg
            className="chart-svg"
            viewBox={`0 0 ${pointWidth} ${pointHeight}`}
            role="group"
            aria-label="Plans by water demand and soil health"
          >
            <title>How the plans trade off</title>
            <desc>Each circle is a plan. Focus and select a plan to update its details.</desc>
            {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
              <g key={tick}>
                <line
                  className="chart-grid-line"
                  x1={left}
                  x2={left + plotWidth}
                  y1={top + tick * plotHeight}
                  y2={top + tick * plotHeight}
                />
                <text
                  className="chart-label"
                  x={left - 12}
                  y={top + tick * plotHeight + 4}
                  textAnchor="end"
                >
                  {formatNullable(1 - tick, 2)}
                </text>
              </g>
            ))}
            <line
              className="chart-axis"
              x1={left}
              x2={left + plotWidth}
              y1={top + plotHeight}
              y2={top + plotHeight}
            />
            <line className="chart-axis" x1={left} x2={left} y1={top} y2={top + plotHeight} />
            <text
              className="chart-label"
              x={left + plotWidth / 2}
              y={pointHeight - 7}
              textAnchor="middle"
            >
              Water demand (mm), lower is better
            </text>
            <text
              className="chart-label"
              transform={`translate(16 ${top + plotHeight / 2}) rotate(-90)`}
              textAnchor="middle"
            >
              Soil health, higher is better
            </text>
            {front.length > 0 ? (
              <path d={linePath} fill="none" stroke="var(--signal)" strokeWidth="1.5" />
            ) : null}
            {sorted.map((plan) => (
              <g
                key={plan.id}
                className="plot-dot"
                tabIndex={0}
                role="img"
                aria-label={`Rank ${plan.rank}, water ${formatNullable(plan.indicators.water_demand_mm_total.value)} millimeters, soil health ${formatNullable(plan.indicators.soil_health_index.value, 2)}, climate risk ${formatNullable(plan.indicators.climate_risk_index.value, 2)}`}
                onClick={() => onSelect(plan)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(plan);
                  }
                }}
              >
                <circle
                  cx={x(plan)}
                  cy={y(plan)}
                  r={plan.id === selectedPlan?.id ? 8 : 5}
                  fill="var(--signal)"
                  stroke={plan.id === selectedPlan?.id ? "var(--night)" : "var(--surface)"}
                  strokeWidth={plan.id === selectedPlan?.id ? 2 : 1}
                />
                <title>Rank {plan.rank}</title>
              </g>
            ))}
          </svg>
          <p className="chart-summary">
            Horizontal axis does not start at 0. Water demand ranges from {formatNullable(min)} to{" "}
            {formatNullable(max)} millimeters.
          </p>
        </>
      )}
    </div>
  );
}

function PlanTable({
  plans,
  total,
  page,
  setPage,
  pageCount,
  filter,
  setFilter,
  sortBy,
  setSortBy,
  onSelect,
}: {
  plans: Plan[];
  total: number;
  page: number;
  setPage: (page: number) => void;
  pageCount: number;
  filter: string;
  setFilter: (filter: string) => void;
  sortBy: string;
  setSortBy: (sortBy: string) => void;
  onSelect: (plan: Plan) => void;
}) {
  return (
    <>
      <div className="method-filter-row">
        <label className="field-block">
          <span className="field-label">Find a plan</span>
          <input
            className="search-input"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              setPage(0);
            }}
          />
        </label>
        <label className="field-block">
          <span className="field-label">Sort plans</span>
          <select
            className="select-input"
            value={sortBy}
            onChange={(event) => setSortBy(event.target.value)}
          >
            <option value="rank">Rank</option>
            <option value="water">Water demand</option>
            <option value="score">Score</option>
          </select>
        </label>
      </div>
      <p className="notice-text" role="status">
        {total} plans.
      </p>
      <DataTable
        headers={[
          "Rank",
          "Plan",
          "Water demand (mm)",
          "Soil health",
          "Climate risk",
          "Score",
          "On front",
        ]}
        rows={plans.map((plan) => [
          <Button key={plan.id} variant="quiet" onClick={() => onSelect(plan)}>
            Select rank {plan.rank} plan
          </Button>,
          plan.slots
            .map((slot) => CROP_LIST.find((crop) => crop.id === slot.crop_id)?.letter)
            .join(" "),
          formatNullable(plan.indicators.water_demand_mm_total.value),
          formatNullable(plan.indicators.soil_health_index.value, 2),
          formatNullable(plan.indicators.climate_risk_index.value, 2),
          scoreFormatter.format(plan.score),
          plan.pareto ? "Yes" : "No",
        ])}
        caption="All plan rows come from the calculation engine. Every row retains its evidence through the plan details."
      />
      <p className="page-count">
        {total === 0
          ? "No plans match the current search."
          : `${page * 25 + 1} to ${Math.min(total, page * 25 + plans.length)} of ${total}`}{" "}
        <Button variant="quiet" disabled={page <= 0} onClick={() => setPage(page - 1)}>
          Previous page
        </Button>
        <Button variant="quiet" disabled={page >= pageCount - 1} onClick={() => setPage(page + 1)}>
          Next page
        </Button>
      </p>
    </>
  );
}

function SelectedPlanTable({
  plan,
  onEvidence,
  onFigure,
  salinity,
}: {
  plan: Plan;
  onEvidence: () => void;
  onFigure: (detail: string) => void;
  salinity: string;
}) {
  const rows = plan.slot_details.map(
    (slot) =>
      [
        String(slot.year),
        slot.season,
        <span className="crop-legend" key={`${slot.year}-${slot.season}`}>
          <CropCell cropId={slot.crop_id} label={`Year ${slot.year}, ${slot.season}`} />
          {cropName(slot.crop_id)}
        </span>,
        <button
          className="button-reset action-button quiet"
          key={`${slot.year}-water`}
          onClick={() =>
            onFigure(
              `Estimated crop water demand for ${slot.season}, year ${slot.year}, in millimeters.`,
            )
          }
        >
          {formatNullable(slot.water_demand_mm)}
        </button>,
        <span key={`${slot.year}-n`} className="nitrogen-column">
          {formatNullable(slot.n_balance_kg_ha)}
        </span>,
        formatNullable(slot.relative_yield_reduction_pct),
      ] as const,
  );
  return (
    <>
      <p className="section-description">
        Rank {plan.rank}. Evidence for this plan: weakest grade {plan.evidence.weakest_grade},
        labels{" "}
        {[...new Set(plan.provenance.map((entry) => entry.label))].join(", ") || "not supplied"}.
        The engine reports evidence per plan, not per season.
      </p>
      <div className="evidence-line">
        <GradeChip grade={plan.evidence.weakest_grade} />
        {[...new Set(plan.provenance.map((entry) => entry.label))].map((label) => (
          <LabelChip key={label} label={label} />
        ))}
        <EvidenceButton onOpen={onEvidence} />
      </div>
      {plan.slot_details.length ? (
        <DataTable
          headers={[
            "Year",
            "Season",
            "Crop",
            "Water demand (mm)",
            "Nitrogen balance (kg per ha)",
            "Yield reduction from salinity (percent)",
          ]}
          rows={rows}
          caption={`Rank ${plan.rank} seasonal estimates. Null values are not available.`}
        />
      ) : (
        <p className="page-count">Season details are not available in this engine response.</p>
      )}
      {!salinity ? (
        <p className="field-hint">
          Enter a soil salinity value to see yield reduction from salinity.
        </p>
      ) : null}
    </>
  );
}

function ndviColor(value: number) {
  if (value < 0.2) return "var(--ndvi-1)";
  if (value < 0.35) return "var(--ndvi-2)";
  if (value < 0.5) return "var(--ndvi-3)";
  if (value < 0.65) return "var(--ndvi-4)";
  return "var(--ndvi-5)";
}

function NdviView({ file, onEvidence }: { file: NdviFile; onEvidence: () => void }) {
  const [showTable, setShowTable] = useState(false);
  const accepted = file.composite_dates
    .map((date, index) => ({ date, value: file.ndvi[index], quality: file.quality_ok[index] }))
    .filter(
      (entry): entry is { date: string; value: number; quality: boolean } =>
        entry.quality === true && typeof entry.value === "number" && Number.isFinite(entry.value),
    );
  const passed = file.quality_ok.filter(Boolean).length;
  if (!accepted.length)
    return (
      <div className="chart-wrap">
        <p className="muted">No composites passed the quality check.</p>
      </div>
    );
  const width = 760;
  const height = 220;
  const pad = { left: 40, right: 12, top: 12, bottom: 26 };
  const times = accepted.map((entry) => Date.parse(entry.date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const x = (t: number) => pad.left + ((t - t0) / (t1 - t0 || 1)) * (width - pad.left - pad.right);
  const y = (v: number) =>
    pad.top + (1 - Math.max(0, Math.min(1, v))) * (height - pad.top - pad.bottom);
  const line = accepted
    .map(
      (entry, index) =>
        `${index ? "L" : "M"} ${x(Date.parse(entry.date)).toFixed(1)} ${y(entry.value).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L ${x(t1).toFixed(1)} ${y(0)} L ${x(t0).toFixed(1)} ${y(0)} Z`;
  const years = [...new Set(accepted.map((entry) => entry.date.slice(0, 4)))];
  const values = accepted.map((entry) => entry.value);
  const latest = accepted[accepted.length - 1];
  return (
    <div className="chart-wrap ndvi-panel">
      <div className="ndvi-stats">
        <div>
          <span className="stat-label">Latest</span>
          <strong>{formatNullable(latest?.value ?? null, 2)}</strong>
          <span className="stat-label">{latest ? formatDate(latest.date) : ""}</span>
        </div>
        <div>
          <span className="stat-label">Range</span>
          <strong>
            {formatNullable(Math.min(...values), 2)} to {formatNullable(Math.max(...values), 2)}
          </strong>
        </div>
        <div>
          <span className="stat-label">Passed quality check</span>
          <strong>
            {passed} of {file.composite_dates.length}
          </strong>
        </div>
      </div>
      <svg
        className="ndvi-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`NDVI from ${formatDate(accepted[0]?.date ?? "")} to ${formatDate(latest?.date ?? "")}, between ${formatNullable(Math.min(...values), 2)} and ${formatNullable(Math.max(...values), 2)}.`}
      >
        <defs>
          <linearGradient id="ndvi-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--ndvi-4)" stopOpacity="0.45" />
            <stop offset="1" stopColor="var(--ndvi-1)" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
          <g key={tick}>
            <line
              className="chart-grid-line"
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text className="chart-label" x={pad.left - 8} y={y(tick) + 4} textAnchor="end">
              {tick.toFixed(2)}
            </text>
          </g>
        ))}
        {years.map((year) => (
          <text
            key={year}
            className="chart-label"
            x={x(Math.max(t0, Date.parse(`${year}-01-01`)))}
            y={height - 6}
          >
            {year}
          </text>
        ))}
        <path d={area} fill="url(#ndvi-fill)" />
        <path className="ndvi-line" d={line} />
        {accepted.map((entry) => (
          <circle
            key={entry.date}
            cx={x(Date.parse(entry.date))}
            cy={y(entry.value)}
            r="3"
            fill={ndviColor(entry.value)}
          />
        ))}
      </svg>
      <div className="ndvi-legend" aria-hidden="true">
        <span>Bare</span>
        <span className="ndvi-ramp" />
        <span>Dense green</span>
      </div>
      <div className="control-row">
        <Button
          variant="quiet"
          aria-expanded={showTable}
          onClick={() => setShowTable((open) => !open)}
        >
          {showTable ? "Hide table" : "Show as table"}
        </Button>
        <Button variant="quiet" onClick={onEvidence}>
          Evidence details
        </Button>
      </div>
      {showTable ? (
        <div className="table-scroll">
          <DataTable
            headers={["Composite start", "NDVI"]}
            rows={accepted.map((entry) => [formatDate(entry.date), formatNullable(entry.value, 3)])}
            caption={`${file.product} version ${file.version}. Dates are 16-day window starts.`}
          />
        </div>
      ) : null}
    </div>
  );
}

function EvidenceDrawer({
  context,
  bundle,
  onClose,
}: {
  context: EvidenceContext | null;
  bundle: ActualBundle | null;
  onClose: () => void;
}) {
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
  const sourceIds = [
    ...new Set(configEntries.flatMap((entry) => (entry.source_id ? [entry.source_id] : []))),
  ];
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden="true" />
      <aside
        className="drawer-panel drawer-mobile"
        aria-label="Evidence details"
        aria-modal="true"
        role="dialog"
        ref={ref}
        tabIndex={-1}
      >
        <div className="drawer-heading">
          <div>
            <h2>{context.title}</h2>
            <p className="field-hint">{context.detail}</p>
          </div>
          <Button aria-label="Close" onClick={onClose}>
            Close
          </Button>
        </div>
        {plan ? (
          <>
            <h3>Evidence for rank {plan.rank}</h3>
            <p className="section-description">
              Weakest grade: <GradeChip grade={plan.evidence.weakest_grade} />
            </p>
            <h3>Where the numbers come from</h3>
            <section className="source-row">
              <h4>Data</h4>
              {dataEntries.slice(0, visibleSources).map((entry, index) => (
                <ProvenanceRow entry={entry} key={`${entry.ref}-${index}`} />
              ))}
            </section>
            <section className="source-row">
              <h4>Configuration</h4>
              {configEntries.slice(0, visibleSources).map((entry, index) => (
                <ProvenanceRow entry={entry} key={`${entry.ref}-${index}`} />
              ))}
            </section>
            {provenance.length > visibleSources ? (
              <Button variant="quiet" onClick={() => setVisibleSources(provenance.length)}>
                Show all {provenance.length}
              </Button>
            ) : null}
            <h3 className="section-block">Sources</h3>
            {sourceIds.length ? (
              sourceIds.map((id) => {
                const source = sources.get(id);
                return source ? (
                  <div className="source-row" key={id} id={`source-${id}`}>
                    <strong>{source.id}</strong>
                    <p>{source.citation}</p>
                    <p className="provenance-ref">{source.url_or_doi}</p>
                    <p>
                      {source.date_opened}. {source.access_status}.
                    </p>
                  </div>
                ) : null;
              })
            ) : (
              <p>No source records were returned for this plan.</p>
            )}
            <a className="action-button" href="#/method">
              See all assumptions and sources
            </a>
          </>
        ) : (
          <p>Select a number to see where it comes from.</p>
        )}
      </aside>
    </>
  );
}

function ProvenanceRow({ entry }: { entry: ProvenanceEntry }) {
  return (
    <div className="source-row">
      <code className="provenance-ref">{entry.ref}</code>
      <div className="evidence-line">
        <LabelChip label={entry.label} />
        {entry.evidence_grade ? <GradeChip grade={entry.evidence_grade} /> : null}
      </div>
      {entry.source_id ? (
        <a className="notice-text" href={`#source-${encodeURIComponent(entry.source_id)}`}>
          {entry.source_id}
        </a>
      ) : null}
    </div>
  );
}

export function RotaNileApp() {
  const [section, setSection] = useState<ViewSection>("/");
  const [loadState, setLoadState] = useState<LoadState>({
    phase: "loading",
    message: "Preparing the data request.",
    locations: [],
  });
  const [drawer, setDrawer] = useState<EvidenceContext | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [response, setResponse] = useState<EngineResponse | null>(null);
  const loaderRef = useRef<BundleLoader | null>(null);

  useEffect(() => {
    const dataBase = new URL(`${import.meta.env.BASE_URL}data/`, window.location.href).href;
    const loader = createBundleLoader({
      services: directServices,
      dataBase,
      onUpdate: setLoadState,
    });
    loaderRef.current = loader;
    void loader.start();
    return () => loader.stop();
  }, [retryCount]);

  useEffect(() => {
    const readHash = () => {
      const { section: next } = parsePlannerHash(window.location.hash);
      setSection(next as ViewSection);
      const region = document.getElementById("polite-status");
      if (region)
        region.textContent = `${NAVIGATION_ITEMS.find((item) => item.path === next)?.label ?? "Planner"} page`;
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const bundle: ActualBundle | null = loadState.phase === "ready" ? loadState.bundle : null;
  const bundleError = useMemo<BundleError | null>(
    () =>
      loadState.phase === "config_missing"
        ? { kind: "bundle_missing", file: loadState.file, detail: loadState.detail }
        : loadState.phase === "failed"
          ? { kind: "network", detail: `${loadState.error.service}: ${loadState.error.message}` }
          : null,
    [loadState],
  );
  const retry = useCallback(() => setRetryCount((count) => count + 1), []);

  // Background recovery: failed loads retry on a capped exponential schedule (15 s up to 5 min).
  const failedKey =
    loadState.phase === "ready"
      ? loadState.locations
          .filter((item) => item.power === "failed" || item.vegetation === "unavailable")
          .map((item) => `${item.point_id}:${item.power}:${item.vegetation}`)
          .join("|")
      : loadState.phase === "failed" || loadState.phase === "config_missing"
        ? loadState.phase
        : "";
  const attemptsRef = useRef(0);
  useEffect(() => {
    if (!failedKey) {
      attemptsRef.current = 0;
      return;
    }
    const delay = Math.min(300_000, 15_000 * 2 ** attemptsRef.current);
    const timer = window.setTimeout(() => {
      attemptsRef.current += 1;
      if (loadState.phase !== "ready") {
        setRetryCount((count) => count + 1);
        return;
      }
      for (const item of loadState.locations) {
        if (item.power === "failed") void loaderRef.current?.retryPoint(item.point_id);
        else if (item.vegetation === "unavailable")
          void loaderRef.current?.retryVegetation(item.point_id);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [failedKey, loadState]);
  const retryPoint = useCallback((id: string) => void loaderRef.current?.retryPoint(id), []);
  const retryVegetation = useCallback(
    (id: string) => void loaderRef.current?.retryVegetation(id),
    [],
  );
  const openEvidence = useCallback((context: EvidenceContext) => setDrawer(context), []);
  const dataMode: DataMode | null = loadState.phase === "ready" ? loadState.mode : null;
  const retrievedAt = loadState.phase === "ready" ? loadState.retrievedAt : null;
  const vegetationPending = loadState.phase === "ready" && loadState.vegetationPending;
  const commonProps = useMemo(
    () => ({
      bundle,
      response,
      openEvidence,
      retry,
      loading: loadState.phase === "loading",
      error: bundleError,
      dataMode,
      retrievedAt,
      vegetationPending,
    }),
    [
      bundle,
      response,
      openEvidence,
      retry,
      loadState.phase,
      bundleError,
      dataMode,
      retrievedAt,
      vegetationPending,
    ],
  );

  return (
    <Shell section={section}>
      {section === "/" ? (
        <PlannerView
          bundle={bundle}
          loadState={loadState}
          retry={retry}
          retryPoint={retryPoint}
          retryVegetation={retryVegetation}
          openEvidence={openEvidence}
          onResponse={setResponse}
        />
      ) : null}
      {section === "/method" ? (
        <Suspense fallback={<p className="chart-wrap">Loading method and data.</p>}>
          <LazyMethodView {...commonProps} />
        </Suspense>
      ) : null}
      {section === "/global" ? (
        <Suspense fallback={<p className="chart-wrap">Loading region information.</p>}>
          <LazyGlobalView bundle={bundle} error={bundleError} retry={retry} />
        </Suspense>
      ) : null}
      {section === "/about" ? (
        <Suspense fallback={<p className="chart-wrap">Loading project information.</p>}>
          <LazyAboutView bundle={bundle} response={response} retrievedAt={retrievedAt} />
        </Suspense>
      ) : null}
      <EvidenceDrawer context={drawer} bundle={bundle} onClose={() => setDrawer(null)} />
    </Shell>
  );
}
