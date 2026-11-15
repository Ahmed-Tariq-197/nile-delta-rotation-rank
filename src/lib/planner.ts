import type { AppError, BundleData, EngineRequest, EngineResponse } from "@/lib/contract";

let plannerWorker: Worker | undefined;
let requestSequence = 0;
const pending = new Map<
  number,
  { resolve: (response: EngineResponse) => void; reject: (error: AppError) => void; timer: number }
>();

function makeError(kind: AppError["kind"], detail: string, file?: string): AppError {
  return { kind, detail, ...(file ? { file } : {}) };
}

function getPlannerWorker() {
  if (plannerWorker) return plannerWorker;
  plannerWorker = new Worker(new URL("../workers/planner.worker.ts", import.meta.url), {
    type: "module",
  });
  plannerWorker.onmessage = (
    event: MessageEvent<{ id: number; ok: boolean; response?: EngineResponse; error?: AppError }>,
  ) => {
    const item = pending.get(event.data.id);
    if (!item) return;
    window.clearTimeout(item.timer);
    pending.delete(event.data.id);
    if (event.data.ok && event.data.response) item.resolve(event.data.response);
    else
      item.reject(
        event.data.error ?? makeError("engine_missing", "The calculation engine is unavailable."),
      );
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

/** Run the engine in a worker. The assembled bundle is passed along because live data have no static files. */
export function runPlanner(request: EngineRequest, bundle?: BundleData): Promise<EngineResponse> {
  return new Promise((resolve, reject) => {
    const id = ++requestSequence;
    const dataBase = new URL(`${import.meta.env.BASE_URL}data/`, window.location.href).href;
    const timer = window.setTimeout(() => {
      const current = pending.get(id);
      if (!current) return;
      pending.delete(id);
      plannerWorker?.terminate();
      plannerWorker = undefined;
      reject(makeError("calculation_timeout", "The calculation took longer than 20 seconds and was stopped."));
    }, 20_000);
    pending.set(id, { resolve, reject, timer });
    try {
      getPlannerWorker().postMessage({ id, request, dataBase, bundle });
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
