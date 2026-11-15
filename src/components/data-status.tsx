import { Button, DataTable, InlineMessage } from "@/components/ui/pieces";
import type { DataMode } from "@/lib/app-types";
import type { BundleData } from "@/lib/contract";
import type { LocationProgress, LoadState } from "@/lib/data/loader";
import { sourceSentence } from "@/lib/data/snapshot-export";
import { formatDate } from "@/lib/format";

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
  if (item.vegetation === "unavailable")
    return `Unavailable. ${item.vegetation_detail ?? ""}`.trim();
  return "Waiting";
}

export function LocationProgressTable({
  locations,
  caption,
}: {
  locations: LocationProgress[];
  caption: string;
}) {
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
        {state.message || "Requesting NASA POWER climate and MODIS vegetation."}
      </p>
      <div className="loading-bar" aria-hidden="true" />
      <LocationProgressTable locations={state.locations} caption="Status per location." />
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
        detail={`${state.detail} The planner needs ${state.file}. Retrying automatically.`}
        variant="error"
      >
        <Button className="retry-button" variant="quiet" onClick={retry}>
          Retry now
        </Button>
      </InlineMessage>
    );
  const where = state.error.point_id ? ` for location ${state.error.point_id}` : "";
  return (
    <InlineMessage
      title={`${state.error.service} data are unavailable${where}`}
      detail={`${state.error.message} No substitute values are shown. Retrying automatically.`}
      variant="error"
    >
      <LocationProgressTable locations={state.locations} caption="Status per location." />
      <Button className="retry-button" variant="quiet" onClick={retry}>
        Retry now
      </Button>
    </InlineMessage>
  );
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
    <p className="source-line">
      <span className="source-chip">{mode === "snapshot" ? "Saved snapshot" : "Live"}</span>
      <span>
        NASA POWER and MODIS, latest available through{" "}
        <strong>{formatDate(bundle.manifest.data.end_date)}</strong>
      </span>
      <span className="sr-only">. {sourceSentence(bundle, retrievedAt)}</span>
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
  const vegetationLoading = locations.filter(
    (item) => item.vegetation === "loading" || item.vegetation === "waiting",
  );
  const vegetationMissing = locations.filter(
    (item) => item.vegetation === "unavailable" && item.power === "ready",
  );
  if (!failed.length && !vegetationLoading.length && !vegetationMissing.length) return null;
  return (
    <div className="input-stack" aria-live="polite">
      {failed.map((item) => (
        <InlineMessage
          key={item.point_id}
          title={`NASA POWER climate is unavailable for ${item.area} (${item.point_id})`}
          detail={`${item.power_error?.message ?? "The request failed."} Hidden until it loads; retrying automatically.`}
          variant="error"
        >
          <Button className="retry-button" variant="quiet" onClick={() => retryPoint(item.point_id)}>
            Retry {item.area}
          </Button>
        </InlineMessage>
      ))}
      {vegetationMissing.map((item) => (
        <InlineMessage
          key={`veg-${item.point_id}`}
          title={`MODIS vegetation record is unavailable for ${item.area} (${item.point_id})`}
          detail={`${item.vegetation_detail ?? "The request failed."} Retrying automatically.`}
          variant="warning"
        >
          <Button
            className="retry-button"
            variant="quiet"
            onClick={() => retryVegetation(item.point_id)}
          >
            Retry now
          </Button>
        </InlineMessage>
      ))}
      {vegetationLoading.length ? (
        <InlineMessage
          title="Vegetation still loading"
          detail="Climate is ready. MODIS answers slowly, so NDVI fills in per location."
          variant="info"
        >
          <div className="loading-bar" aria-hidden="true" />
        </InlineMessage>
      ) : null}
    </div>
  );
}
