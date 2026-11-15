import type { AppError, ClimateFile, EngineRequest, EngineResponse, UiBundle } from "@/lib/contract";

const base = `${import.meta.env.BASE_URL}data/`;
let bundlePromise: Promise<UiBundle> | undefined;
let plannerWorker: Worker | undefined;
let requestSequence = 0;
const pending = new Map<number, { resolve: (response: EngineResponse) => void; reject: (error: AppError) => void; timer: number }>();

function makeError(kind: AppError["kind"], detail: string, file?: string): AppError {
  return { kind, detail, ...(file ? { file } : {}) };
}

async function readJson(path: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`);
  } catch {
    throw makeError("network", "The data could not be reached.", path);
  }
  if (response.status === 404) throw makeError("bundle_missing", "A required bundle file is missing.", path);
  if (!response.ok) throw makeError("network", `The data request returned status ${response.status}.`, path);
  try {
    return await response.json();
  } catch {
    throw makeError("bundle_invalid", "The bundle file is not valid JSON.", path);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateBundle(points: unknown, config: unknown, manifest: unknown): asserts points is UiBundle["points"] {
  if (!isRecord(points) || typeof points["bundle_version"] !== "string" || !Array.isArray(points["points"])) {
    throw makeError("bundle_invalid", "The locations file does not match the RotaNile contract.", "points.json");
  }
  if (!isRecord(config) || typeof config["schema_version"] !== "string" || !isRecord(config["crops"])) {
    throw makeError("bundle_invalid", "The crop configuration does not match the RotaNile contract.", "config.json");
  }
  if (!isRecord(manifest) || typeof manifest["bundle_version"] !== "string" || !isRecord(manifest["data"])) {
    throw makeError("bundle_invalid", "The data manifest does not match the RotaNile contract.", "manifest.json");
  }
  const data = manifest["data"];
  if (!isRecord(data) || typeof data["end_date"] !== "string") {
    throw makeError("bundle_invalid", "The manifest is missing its latest available date.", "manifest.json");
  }
}

export function loadBundle(): Promise<UiBundle> {
  if (!bundlePromise) {
    bundlePromise = Promise.all([
      readJson("points.json"),
      readJson("config.json"),
      readJson("manifest.json"),
    ]).then(async ([points, config, manifest]) => {
      validateBundle(points, config, manifest);
      const pointList = points.points;
      if (pointList.some((point) => !isRecord(point) || typeof point["id"] !== "string")) {
        throw makeError("bundle_invalid", "One or more location records are incomplete.", "points.json");
      }
      const vegetationFiles = await Promise.all(pointList.map(async (point) => {
        const file = await readJson(`ndvi/${point.id}.json`);
        if (!isRecord(file) || file["point_id"] !== point.id || !Array.isArray(file["composite_dates"]) || !Array.isArray(file["ndvi"]) || !Array.isArray(file["quality_ok"])) {
          throw makeError("bundle_invalid", "A vegetation record does not match the RotaNile contract.", `ndvi/${point.id}.json`);
        }
        return [point.id, file as unknown as UiBundle["ndvi"][string]] as const;
      }));
      return {
        points: points as UiBundle["points"],
        config: config as UiBundle["config"],
        manifest: manifest as UiBundle["manifest"],
        ndvi: Object.fromEntries(vegetationFiles),
      };
    }).catch((error: unknown) => {
      bundlePromise = undefined;
      throw error;
    });
  }
  return bundlePromise;
}

function getPlannerWorker() {
  if (plannerWorker) return plannerWorker;
  plannerWorker = new Worker(new URL("../workers/planner.worker.ts", import.meta.url), { type: "module" });
  plannerWorker.onmessage = (event: MessageEvent<{ id: number; ok: boolean; response?: EngineResponse; error?: AppError }>) => {
    const item = pending.get(event.data.id);
    if (!item) return;
    window.clearTimeout(item.timer);
    pending.delete(event.data.id);
    if (event.data.ok && event.data.response) item.resolve(event.data.response);
    else item.reject(event.data.error ?? makeError("engine_missing", "The calculation engine is unavailable."));
  };
  plannerWorker.onerror = () => {
    for (const [id, item] of pending) {
      window.clearTimeout(item.timer);
      item.reject(makeError("engine_missing", "The calculation engine could not start."));
      pending.delete(id);
    }
    plannerWorker?.terminate();
    plannerWorker = undefined;
  };
  return plannerWorker;
}

export function runPlanner(request: EngineRequest): Promise<EngineResponse> {
  return new Promise((resolve, reject) => {
    const id = ++requestSequence;
    const timer = window.setTimeout(() => {
      const current = pending.get(id);
      if (!current) return;
      pending.delete(id);
      plannerWorker?.terminate();
      plannerWorker = undefined;
      reject(makeError("calculation_timeout", "The calculation took too long. Try again."));
    }, 20_000);
    pending.set(id, { resolve, reject, timer });
    try {
      getPlannerWorker().postMessage({ id, request });
    } catch {
      window.clearTimeout(timer);
      pending.delete(id);
      reject(makeError("engine_missing", "The calculation engine could not start."));
    }
  });
}

export function clearPlannerWorker() {
  plannerWorker?.terminate();
  plannerWorker = undefined;
  for (const item of pending.values()) {
    window.clearTimeout(item.timer);
    item.reject(makeError("engine_missing", "The calculation engine was stopped."));
  }
  pending.clear();
}