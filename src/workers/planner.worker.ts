import type { AppError, BundleData, EngineRequest, EngineResponse, PointsFile } from "@/lib/contract";

const base = `${import.meta.env.BASE_URL}data/`;
let bundlePromise: Promise<BundleData> | undefined;

type WorkerScope = typeof self & {
  postMessage: (message: { id: number; ok: boolean; response?: EngineResponse; error?: AppError }) => void;
};

function error(kind: AppError["kind"], detail: string, file?: string): AppError {
  return { kind, detail, ...(file ? { file } : {}) };
}

async function json(path: string) {
  const response = await fetch(`${base}${path}`);
  if (response.status === 404) throw error("bundle_missing", "A required bundle file is missing.", path);
  if (!response.ok) throw error("network", `The data request returned status ${response.status}.`, path);
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    throw error("bundle_invalid", "The bundle file is not valid JSON.", path);
  }
}

function loadFullBundle() {
  if (!bundlePromise) {
    bundlePromise = Promise.all([json("points.json"), json("config.json"), json("manifest.json")]).then(async ([points, config, manifest]) => {
      if (!Array.isArray(points["points"]) || !config["crops"] || !manifest["data"]) {
        throw error("bundle_invalid", "The full calculation bundle is incomplete.");
      }
      const pointList = points["points"] as PointsFile["points"];
      const [climateEntries, ndviEntries] = await Promise.all([
        Promise.all(pointList.map(async (point) => [point.id, await json(`climate/${point.id}.json`)] as const)),
        Promise.all(pointList.map(async (point) => [point.id, await json(`ndvi/${point.id}.json`)] as const)),
      ]);
      return {
        points: points as unknown as BundleData["points"],
        climate: Object.fromEntries(climateEntries) as BundleData["climate"],
        ndvi: Object.fromEntries(ndviEntries) as BundleData["ndvi"],
        config: config as unknown as BundleData["config"],
        manifest: manifest as unknown as BundleData["manifest"],
      };
    }).catch((reason: unknown) => {
      bundlePromise = undefined;
      throw reason;
    });
  }
  return bundlePromise;
}

const engineModules = import.meta.glob("../engine/index.ts");

async function calculate(request: EngineRequest) {
  const enginePath = Object.keys(engineModules)[0];
  const loadEngine = enginePath ? engineModules[enginePath] : undefined;
  if (!loadEngine) throw error("engine_missing", "The crop-rotation calculation engine was not supplied.", "src/engine/index.ts");
  const engine = await loadEngine() as {
    evaluate: (request: EngineRequest, bundle: BundleData) => EngineResponse;
    validateResponse: (response: EngineResponse) => { ok: boolean; errors: string[] };
  };
  const bundle = await loadFullBundle();
  const response = await engine.evaluate(request, bundle);
  const validation = engine.validateResponse(response);
  if (!validation.ok) throw error("bundle_invalid", validation.errors.join(" "), "engine response");
  return response;
}

const scope = self as WorkerScope;
scope.onmessage = async (event: MessageEvent<{ id: number; request: EngineRequest }>) => {
  const { id, request } = event.data;
  try {
    const response = await calculate(request);
    scope.postMessage({ id, ok: true, response });
  } catch (reason) {
    const detail = reason !== null && typeof reason === "object" && "detail" in reason
      ? String(reason.detail)
      : reason instanceof Error ? reason.message : "The calculation could not run.";
    const kind = reason !== null && typeof reason === "object" && "kind" in reason
      ? reason.kind as AppError["kind"]
      : "engine_missing";
    scope.postMessage({ id, ok: false, error: error(kind, detail) });
  }
};