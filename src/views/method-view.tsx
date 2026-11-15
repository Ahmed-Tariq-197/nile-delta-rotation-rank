import { useState } from "react";

import { Button, DataTable, GradeChip, InlineMessage, LabelChip } from "@/components/ui/pieces";
import { DataSourceLine } from "@/components/data-status";
import { PageHero } from "@/components/layout";
import { DATA_LIMITS, POWER_VARIABLE_LABELS } from "@/lib/app-content";
import { exportSnapshot } from "@/lib/data/snapshot-export";
import type { ActualBundle, ViewProps } from "@/lib/app-types";
import { formatDate, formatDateTime, formatNullable } from "@/lib/format";

function variableRows(bundle: ActualBundle) {
  const requests = bundle.manifest.data.power.requests ?? {};
  const pointIds = Object.keys(requests);
  const totalRows = Object.values(bundle.manifest.data.power.row_counts).reduce(
    (sum, value) => sum + value,
    0,
  );
  return Object.entries(bundle.manifest.data.power.variables).map(([key, item]) => {
    const served = [
      ...new Set(pointIds.map((id) => requests[id]?.served_units[key]).filter(Boolean)),
    ];
    const factors = [
      ...new Set(
        pointIds.flatMap((id) =>
          (requests[id]?.conversions ?? [])
            .filter((entry) => entry.variable === key)
            .map((entry) => entry.factor),
        ),
      ),
    ];
    const missing = Object.values(bundle.manifest.data.power.missing_counts).reduce(
      (sum, counts) => sum + (counts[key] ?? 0),
      0,
    );
    return [
      POWER_VARIABLE_LABELS[key] ? `${POWER_VARIABLE_LABELS[key]} (${key})` : key,
      served.length ? served.join(", ") : "Not stated",
      `${item.unit}; ${factors.length ? factors.map((factor) => (factor === 1 ? "kept as served" : `multiplied by ${factor}`)).join(", ") : "conversion not recorded"}`,
      <LabelChip key={key} label={item.label} />,
      item.source,
      totalRows ? `${formatNullable((missing / totalRows) * 100, 1)}%` : "Not available",
    ];
  });
}

export default function MethodView({
  bundle,
  response,
  retry,
  error,
  loading,
  dataMode,
  retrievedAt,
  vegetationPending,
}: ViewProps) {
  const [search, setSearch] = useState("");
  const [rule, setRule] = useState("");
  const [page, setPage] = useState(0);
  const assumptions = bundle?.config.assumptions ?? [];
  const filtered = assumptions.filter(
    (item) =>
      (!rule || item.decision_rule === rule) &&
      (!search ||
        `${item.path} ${item.reason} ${item.planner_fallback}`
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  const rows = filtered.slice(page * 25, page * 25 + 25);

  return (
    <div className="data-layout">
      <PageHero title="Method and data">
        <p className="hero-lede">What goes into a plan, where each number comes from, and its limits.</p>
      </PageHero>
      {!bundle ? (
        <InlineMessage
          title={loading ? "Loading data" : "Data not available yet"}
          {...(loading ? {} : { detail: error?.detail ?? "The data bundle could not be read." })}
          variant={loading ? "info" : "error"}
        >
          {loading ? null : (
            <Button variant="quiet" onClick={retry}>
              Retry now
            </Button>
          )}
        </InlineMessage>
      ) : null}

      <section className="content-section">
        <h2>How a plan is produced</h2>
        <PipelineDiagram />
      </section>

      <section className="content-section">
        <h2>Data</h2>
        {bundle ? (
          <>
            <DataSourceLine bundle={bundle} mode={dataMode} retrievedAt={retrievedAt} />
            <p>
              Time standard: {bundle.manifest.data.time_standard}. Daily series from{" "}
              {formatDate(bundle.manifest.data.power.start)} to{" "}
              {formatDate(bundle.manifest.data.end_date)} (latest available).
            </p>
            <DataTable
              headers={[
                "Variable",
                "Served unit",
                "Canonical unit and conversion",
                "Label",
                "Source",
                "Missing",
              ]}
              rows={variableRows(bundle)}
              caption="Units as stated by NASA POWER. Missing = fill values or out-of-range values, all locations."
            />
            <h3 className="section-block">Vegetation index</h3>
            <p>
              <LabelChip label="observed" /> {bundle.manifest.data.ndvi.product} version{" "}
              {bundle.manifest.data.ndvi.version}, 16-day composites at 250 m. Scale factor{" "}
              {bundle.manifest.data.ndvi.scale_applied || "not yet read"}. Context only, not scored.
            </p>
            <DataTable
              headers={["Location", "Status", "Composites", "Pass quality check"]}
              rows={bundle.points.points.map((point) => {
                const status = bundle.manifest.data.ndvi.status_by_point?.[point.id];
                const counts = bundle.manifest.data.ndvi.composite_counts[point.id];
                return [
                  `${point.area} (${point.id})`,
                  status
                    ? `${status.status}: ${status.detail}`
                    : (bundle.manifest.data.ndvi.source_by_point[point.id] ?? "Not stated"),
                  counts ? String(counts.total) : "–",
                  counts ? String(counts.valid) : "–",
                ];
              })}
            />
            <h3 className="section-block">Unit conversions</h3>
            <ul>
              {Object.entries(bundle.manifest.data.power.requests ?? {}).flatMap(([id, request]) =>
                request.conversions
                  .filter((entry) => entry.factor !== 1)
                  .map((entry) => (
                    <li key={`${id}-${entry.variable}`}>
                      {id}: {entry.variable} served as {entry.served_unit}, multiplied by{" "}
                      {entry.factor} to {entry.canonical_unit}.
                    </li>
                  )),
              )}
              <li>
                All other variables were served in their canonical unit and kept as served. Fill
                value stated by NASA POWER:{" "}
                {[
                  ...new Set(
                    Object.values(bundle.manifest.data.power.requests ?? {}).map(
                      (item) => item.fill_value,
                    ),
                  ),
                ].join(", ") || "not recorded"}
                .
              </li>
            </ul>
            <h3 className="section-block">Locations and grid cells</h3>
            <DataTable
              headers={[
                "Location",
                "Coordinates (proposed)",
                "Elevation (m, from POWER)",
                "Meteorology cell",
                "Solar cell",
                "Shares meteorology cell with",
              ]}
              rows={bundle.points.points.map((point) => {
                const group = bundle.manifest.data.cell_groups.cells.find(
                  (item) => item.cell_id === point.cell_id,
                );
                return [
                  `${point.area} (${point.id})`,
                  `${point.latitude}, ${point.longitude}`,
                  formatNullable(point.elevation_m, 1),
                  point.cell_id,
                  bundle.manifest.data.cell_groups.solar?.point_to_cell[point.id] ?? "–",
                  (group?.point_ids ?? []).filter((id) => id !== point.id).join(", ") || "None",
                ];
              })}
            />
            {bundle.manifest.data.cell_groups.inference ? (
              <p>{bundle.manifest.data.cell_groups.inference}</p>
            ) : null}
            <h3 className="section-block">Warnings</h3>
            {bundle.manifest.warnings.length ? (
              <ul>
                {bundle.manifest.warnings.map((item, index) => (
                  <li key={`${index}-${item}`}>{item}</li>
                ))}
              </ul>
            ) : (
              <p>No warnings were recorded during retrieval.</p>
            )}
            <h3 className="section-block">Export</h3>
            <p className="field-hint">Saves the full data bundle as snapshot.json.</p>
            <Button disabled={vegetationPending} onClick={() => exportSnapshot(bundle)}>
              Export snapshot
            </Button>
            {vegetationPending ? (
              <p className="field-hint" role="status">
                Available when the vegetation records finish loading.
              </p>
            ) : null}
          </>
        ) : (
          <p className="muted">Appears when the data load.</p>
        )}
      </section>

      <section className="content-section">
        <h2>Parameter evidence</h2>
        {bundle ? (
          <>
            <div className="stats-row">
              {(["verified", "provisional", "unresolved"] as const).map((grade) => (
                <dl key={grade} className="stat-item">
                  <dt>
                    <GradeChip grade={grade} />
                  </dt>
                  <dd>{formatNullable(bundle.manifest.config.parameter_counts[grade])}</dd>
                </dl>
              ))}
            </div>
            <p className="section-description">
              Verified: read in an opened source. Provisional: an assumption. Unresolved: no source,
              a documented fallback is used.
            </p>
            <p>
              {Object.values(bundle.manifest.config.parameter_counts).reduce(
                (sum, value) => sum + value,
                0,
              )}{" "}
              parameters across {Object.keys(bundle.config.crops).length} crops,{" "}
              {bundle.manifest.config.assumption_count} assumptions recorded,{" "}
              {bundle.manifest.config.source_count} sources listed.
            </p>
          </>
        ) : (
          <p className="muted">Appears when the configuration loads.</p>
        )}
      </section>

      <section className="content-section">
        <h2>Assumptions</h2>
        {bundle ? (
          <>
            <div className="method-filter-row">
              <label className="field-block">
                <span className="field-label">Search assumptions</span>
                <input
                  className="search-input"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label className="field-block">
                <span className="field-label">Decision rule</span>
                <select
                  className="select-input"
                  value={rule}
                  onChange={(event) => {
                    setRule(event.target.value);
                    setPage(0);
                  }}
                >
                  <option value="">All rules</option>
                  {[...new Set(assumptions.map((item) => item.decision_rule))]
                    .sort()
                    .map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                </select>
              </label>
              {rule ? (
                <Button variant="quiet" onClick={() => setRule("")}>
                  Clear filter {rule}
                </Button>
              ) : null}
            </div>
            <p className="notice-text" role="status">
              {filtered.length} assumptions.
            </p>
            {filtered.length ? (
              <DataTable
                headers={["Path", "Rule", "Reason", "Fallback"]}
                rows={rows.map((item) => [
                  <code key={item.path}>{item.path}</code>,
                  item.decision_rule,
                  item.reason,
                  item.planner_fallback,
                ])}
              />
            ) : (
              <p>No assumptions match {search}. Clear the search.</p>
            )}
            <p className="page-count">
              {filtered.length
                ? `${page * 25 + 1} to ${Math.min(filtered.length, page * 25 + rows.length)} of ${filtered.length}`
                : "No assumptions match the current filters."}{" "}
              <Button
                variant="quiet"
                disabled={page === 0}
                onClick={() => setPage((value) => Math.max(0, value - 1))}
              >
                Previous page
              </Button>
              <Button
                variant="quiet"
                disabled={(page + 1) * 25 >= filtered.length}
                onClick={() => setPage((value) => value + 1)}
              >
                Next page
              </Button>
            </p>
          </>
        ) : (
          <p className="muted">Appears when the configuration loads.</p>
        )}
      </section>

      <section className="content-section" id="limits">
        <h2>Limits</h2>
        {loading ? (
          <p>Loading the engine limits.</p>
        ) : response?.limits.length ? (
          <ul>
            {response.limits.map((item, index) => (
              <li key={`${index}-${item}`}>{item}</li>
            ))}
          </ul>
        ) : (
          <p>Engine limits appear once the calculation engine is added.</p>
        )}
        <h3 className="section-block">Limits of the data</h3>
        <ul>
          {DATA_LIMITS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="content-section">
        <h2>Sources</h2>
        {bundle?.config.sources.length ? (
          bundle.config.sources.map((source) => (
            <div className="source-row" key={source.id} id={`source-${source.id}`}>
              <h3>{source.id}</h3>
              <p>{source.citation}</p>
              <p className="provenance-ref">{source.url_or_doi}</p>
              <p>
                {source.date_opened}. {source.access_status}.
              </p>
              {source.url_or_doi.startsWith("http") ? (
                <a href={source.url_or_doi} target="_blank" rel="noopener noreferrer">
                  Open source {source.id}
                </a>
              ) : null}
            </div>
          ))
        ) : (
          <p>No source records were supplied.</p>
        )}
      </section>
      <section className="content-section">
        <h2>Data version</h2>
        {bundle ? (
          <p>
            Bundle <code>{bundle.manifest.bundle_version.slice(0, 12)}</code>, retrieved{" "}
            {formatDateTime(bundle.manifest.built_at_utc)}. Engine{" "}
            {response?.engine_version ?? "not supplied"}.
          </p>
        ) : (
          <p>Data version details are unavailable.</p>
        )}
      </section>
    </div>
  );
}

function PipelineDiagram() {
  const steps = [
    { title: "NASA POWER + MODIS", note: "Climate and vegetation" },
    { title: "Crop settings", note: "Graded evidence" },
    { title: "Engine", note: "Runs in your browser" },
    { title: "Ranked plans", note: "With their evidence" },
  ];
  return (
    <ol className="pipeline" aria-label="Plan calculation sequence">
      {steps.map((step, index) => (
        <li key={step.title} className={index === 2 ? "pipeline-step engine" : "pipeline-step"}>
          <strong>{step.title}</strong>
          <span>{step.note}</span>
        </li>
      ))}
    </ol>
  );
}
