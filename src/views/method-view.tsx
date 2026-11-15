import { useState } from "react";

import { Button, DataTable, GradeChip, InlineMessage, LabelChip } from "@/components/ui/pieces";
import { POWER_VARIABLE_LABELS } from "@/lib/app-content";
import { medianCadence } from "@/lib/derive";
import { formatDate, formatNullable } from "@/lib/format";
import type { ViewProps } from "@/lib/app-types";
import { formatOrdinal } from "@/lib/format";

export default function MethodView({ bundle, response, retry, error, loading }: ViewProps) {
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
  const variables = Object.entries(bundle?.manifest.data.power.variables ?? {});
  const filePoint = bundle?.points.points[0];

  return (
    <div className="data-layout">
      <header className="page-heading">
        <h1 id="view-heading">Method and data</h1>
        <p>
          Each rotation that meets the constraints is evaluated against water demand, soil health
          and climate risk. With the same inputs and data, the engine returns the same ranking.
        </p>
      </header>
      {!bundle ? (
        <InlineMessage
          title="Data and configuration are not available"
          detail={
            error?.detail ??
            "Add the approved browser data bundle before showing measurements or sources."
          }
          variant="error"
        >
          <Button onClick={retry}>Try again</Button>
        </InlineMessage>
      ) : null}

      <section className="content-section">
        <h2>How a plan is produced</h2>
        <p className="section-description">
          Inputs are kept with their origin and evidence before the calculation returns ranked
          rotations.
        </p>
        <PipelineDiagram />
        <ol>
          <li>
            Daily {bundle?.manifest.data.power.community ?? "climate"} snapshots are paired with the
            supplied vegetation composites.
          </li>
          <li>Crop configuration carries evidence grades and recorded assumptions.</li>
          <li>The calculation engine evaluates eligible rotations in the browser.</li>
          <li>Ranked plans retain their indicators and provenance.</li>
        </ol>
      </section>

      <section className="content-section">
        <h2>Data</h2>
        {bundle ? (
          <>
            <p>
              Time standard: {bundle.manifest.data.time_standard}. Latest available data through{" "}
              {formatDate(bundle.manifest.data.end_date)}.
            </p>
            <DataTable
              headers={["Variable", "Unit", "Label", "Source", "Resolution"]}
              rows={[
                ...variables.map(([key, item]) => [
                  POWER_VARIABLE_LABELS[key] ?? key,
                  item.unit,
                  <LabelChip key={key} label={item.label} />,
                  item.source,
                  "Daily",
                ]),
                [
                  "Vegetation index",
                  "NDVI",
                  <LabelChip key="ndvi-label" label="observed" />,
                  bundle.manifest.data.ndvi.product,
                  "Composite interval from record",
                ],
              ]}
            />
            <h3 className="section-block">Point grid cells</h3>
            <DataTable
              headers={["Point", "Area", "Cell id", "Shares cell with"]}
              rows={bundle.points.points.map((point) => {
                const group = bundle.manifest.data.cell_groups.cells.find(
                  (item) => item.cell_id === point.cell_id,
                );
                return [
                  point.id,
                  point.area,
                  point.cell_id,
                  (group?.point_ids ?? []).filter((id) => id !== point.id).join(", ") ||
                    "None listed",
                ];
              })}
            />
            {bundle.manifest.data.cell_groups.inference ? (
              <p>{bundle.manifest.data.cell_groups.inference}</p>
            ) : null}
            <p className="notice-text">
              Daily cadence:{" "}
              {medianCadence(
                bundle.manifest.data.power.start === bundle.manifest.data.power.end
                  ? [bundle.manifest.data.power.start]
                  : [bundle.manifest.data.power.start, bundle.manifest.data.power.end],
              ) ?? "not available"}{" "}
              day interval from the supplied dates.
            </p>
          </>
        ) : (
          <p>Data rows are not available without the original bundle.</p>
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
              Verified values were read in an opened source. Provisional values are unconfirmed and
              treated as assumptions. Unresolved values have no confirmed source and use a
              documented fallback.
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
          <p>Evidence totals are not shown without the original configuration and manifest.</p>
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
          <p>Assumptions are not available without the supplied crop configuration.</p>
        )}
      </section>

      <section className="content-section">
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
          <p>The engine and its limits statement have not been supplied.</p>
        )}
        <p className="section-description">
          Climate values are cell-scale model output, not field measurements.
        </p>
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
            Bundle {bundle.manifest.bundle_version}, built{" "}
            {formatDate(bundle.manifest.built_at_utc)}. Engine{" "}
            {response?.engine_version ?? "not supplied"}. {bundle.manifest.files.length} manifest
            files.
          </p>
        ) : (
          <p>Data version details are unavailable.</p>
        )}
      </section>
      {filePoint ? <p className="sr-only">Selected point {formatOrdinal(1)}.</p> : null}
    </div>
  );
}

function PipelineDiagram() {
  return (
    <svg
      className="pipeline"
      viewBox="0 0 900 150"
      role="img"
      aria-label="Climate and vegetation snapshots plus crop settings flow into the calculation engine and then produce ranked plans"
    >
      <title>Plan calculation sequence</title>
      <desc>
        Data and configuration inputs are evaluated by the browser engine to produce ranked plans
        with evidence.
      </desc>
      <defs>
        <marker
          id="method-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--rim-strong)" />
        </marker>
      </defs>
      <rect x="22" y="32" width="225" height="78" rx="8" />
      <text x="38" y="62">
        Climate and vegetation
      </text>
      <text x="38" y="88">
        snapshots
      </text>
      <line x1="247" x2="340" y1="72" y2="72" markerEnd="url(#method-arrow)" />
      <rect className="engine-node" x="346" y="32" width="195" height="78" rx="8" />
      <text x="363" y="62">
        Crop configuration
      </text>
      <text x="363" y="88">
        Browser engine
      </text>
      <line x1="541" x2="634" y1="72" y2="72" markerEnd="url(#method-arrow)" />
      <rect x="640" y="32" width="234" height="78" rx="8" />
      <text x="657" y="62">
        Ranked plans
      </text>
      <text x="657" y="88">
        with evidence
      </text>
    </svg>
  );
}
