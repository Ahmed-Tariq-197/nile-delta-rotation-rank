import { Button, DataTable, InlineMessage } from "@/components/ui/pieces";
import type { DataMode } from "@/lib/app-types";
import type { BundleData } from "@/lib/contract";
import type { LocationProgress, LoadState } from "@/lib/data/loader";
import { formatDate, formatDateTime } from "@/lib/format";

const POWER_COPY: Record<LocationProgress["power"], string> = {
  waiting: "Waiting",
  loading: "Requesting",
  ready: "Received",
  failed: "Unavailable",
};

function vegetationText(item: LocationProgress) {
  if (item.vegetation === "loading")
    return item.chunks_total
      ? `Reading composites, ${item.chunks_done} of ${item.chunks_total} groups`
      : (item.vegetation_detail ?? "Requesting");
  if (item.vegetation === "ready") return "Received";
  if (item.vegetation === "unavailable") return `Unavailable. ${item.vegetation_detail ?? ""}`.trim();
  return "Waiting";
}

export function LocationProgressTable({ locations, caption }: { locations: LocationProgress[]; caption: string }) {
  if (!locations.length) return null;
  return (
    <DataTable
      headers={["Location", "Climate (NASA POWER)", "Vegetation (MODIS)"]}
      rows={locations.map((item) => [
        `${item.area} (${item.point_id})`,
        POWER_COPY[item.power],
        vegetationText(item),
      ])}
      caption={caption}
    />
  );
}

export function DataLoading({ state }: { state: Extract<LoadState, { phase: "loading" }> }) {
  return (
    <section className="content-section" aria-labelledby="data-loading-title" aria-busy="true">
      <h2 id="data-loading-title">Loading the latest available data</h2>
      <p className="notice-text" role="status" aria-live="polite">
        {state.message ||
          "Requesting climate series from NASA POWER and vegetation composites from MODIS."}
      </p>
      <LocationProgressTable
        locations={state.locations}
        caption="Request status per location. Climate is needed before the planner opens; vegetation is context and loads afterward."
      />
    </section>
  );
}

export function DataProblem({
  state,
  retry,
}: {
  state: Extract<LoadState, { phase: "config_missing" | "failed" }>;
  retry: () => void;
}) {
  if (state.phase === "config_missing")
    return (
      <InlineMessage
        title="Configuration missing"
        detail={`${state.detail} The planner needs the agronomy configuration file ${state.file}. No values are shown without it.`}
        variant="error"
      >
        <Button className="retry-button" onClick={retry}>
          Retry loading
        </Button>
      </InlineMessage>
    );
  const where = state.error.point_id ? ` for location ${state.error.point_id}` : "";
  return (
    <InlineMessage
      title={`${state.error.service} data are unavailable${where}`}
      detail={`${state.error.message} No substitute values are shown.`}
      variant="error"
    >
      <LocationProgressTable locations={state.locations} caption="Request status per location." />
      <Button className="retry-button" onClick={retry}>
        Retry loading
      </Button>
    </InlineMessage>
  );
}

export function sourceSentence(bundle: BundleData, retrievedAt: string | null) {
  const end = bundle.manifest.data.end_date ? formatDate(bundle.manifest.data.end_date) : "date not stated";
  return `NASA POWER and MODIS, latest available through ${end}, retrieved ${retrievedAt ? formatDateTime(retrievedAt) : "at an unstated time"}.`;
}

export function DataSourceLine({
  bundle,
  mode,
  retrievedAt,
}: {
  bundle: BundleData;
  mode: DataMode | null;
  retrievedAt: string | null;
}) {
  return (
    <p className="notice-text">
      {mode === "snapshot" ? <strong className="label-chip">Frozen snapshot</strong> : null}{" "}
      Data source: {sourceSentence(bundle, retrievedAt)}
    </p>
  );
}

export function LocationIssues({
  locations,
  retryPoint,
  retryVegetation,
}: {
  locations: LocationProgress[];
  retryPoint: (id: string) => void;
  retryVegetation: (id: string) => void;
}) {
  const failed = locations.filter((item) => item.power === "failed");
  const vegetationLoading = locations.filter((item) => item.vegetation === "loading" || item.vegetation === "waiting");
  const vegetationMissing = locations.filter((item) => item.vegetation === "unavailable" && item.power === "ready");
  if (!failed.length && !vegetationLoading.length && !vegetationMissing.length) return null;
  return (
    <div className="input-stack" aria-live="polite">
      {failed.map((item) => (
        <InlineMessage
          key={item.point_id}
          title={`NASA POWER climate is unavailable for ${item.area} (${item.point_id})`}
          detail={`${item.power_error?.message ?? "The request failed."} This location is not shown until its climate series loads.`}
          variant="error"
        >
          <Button className="retry-button" onClick={() => retryPoint(item.point_id)}>
            Retry {item.area}
          </Button>
        </InlineMessage>
      ))}
      {vegetationMissing.map((item) => (
        <InlineMessage
          key={`veg-${item.point_id}`}
          title={`MODIS vegetation record is unavailable for ${item.area} (${item.point_id})`}
          detail={`${item.vegetation_detail ?? "The request failed."} The planner continues without the vegetation panel for this location.`}
          variant="warning"
        >
          <Button className="retry-button" onClick={() => retryVegetation(item.point_id)}>
            Retry vegetation for {item.area}
          </Button>
        </InlineMessage>
      ))}
      {vegetationLoading.length ? (
        <InlineMessage
          title="Vegetation composites are still loading"
          detail="The MODIS service answers slowly (about half a minute per group of ten composites). Climate data are ready; vegetation panels fill in as each location completes."
          variant="info"
        >
          <LocationProgressTable locations={locations} caption="Request status per location." />
        </InlineMessage>
      ) : null}
    </div>
  );
}

/** Download the current complete BundleData unchanged as snapshot.json. */
export function exportSnapshot(bundle: BundleData) {
  const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "snapshot.json";
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
