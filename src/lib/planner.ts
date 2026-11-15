import type { AppError, BundleData, EngineRequest, EngineResponse } from "@/lib/contract";

let plannerWorker: Worker | undefined;
let workerBroken = false;
let requestSequence = 0;
const pending = new Map<
  number,
  {
    resolve: (response: EngineResponse) => void;
    reject: (error: AppError) => void;
    timer: number;
    request: EngineRequest;
    bundle: BundleData;
  }
>();

/** Main-thread fallback, used when the worker cannot start. Loaded on demand. */
async function runOnMainThread(request: EngineRequest, bundle: BundleData) {
  const { runEngine } = await import("@/lib/engine-run");
  return runEngine(request, bundle);
}

function failWorker() {
  plannerWorker?.terminate();
  plannerWorker = undefined;
  workerBroken = true;
  for (const [id, item] of pending) {
    window.clearTimeout(item.timer);
    pending.delete(id);
    runOnMainThread(item.request, item.bundle).then(item.resolve, item.reject);
  }
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
        event.data.error ?? { kind: "engine_error", detail: "The calculation could not run." },
      );
  };
  plannerWorker.onerror = failWorker;
  return plannerWorker;
}

/** Run the engine in a worker, or on the main thread when workers are unavailable. */
export function runPlanner(request: EngineRequest, bundle: BundleData): Promise<EngineResponse> {
  if (workerBroken || typeof Worker === "undefined") return runOnMainThread(request, bundle);
  return new Promise((resolve, reject) => {
    const id = ++requestSequence;
    const timer = window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      plannerWorker?.terminate();
      plannerWorker = undefined;
      reject({
        kind: "calculation_timeout",
        detail: "The calculation took longer than 20 seconds and was stopped.",
      });
    }, 20_000);
    pending.set(id, { resolve, reject, timer, request, bundle });
    try {
      getPlannerWorker().postMessage({ id, request, bundle });
    } catch {
      failWorker();
    }
  });
}

export function clearPlannerWorker() {
  plannerWorker?.terminate();
  plannerWorker = undefined;
  for (const item of pending.values()) window.clearTimeout(item.timer);
  pending.clear();
}
