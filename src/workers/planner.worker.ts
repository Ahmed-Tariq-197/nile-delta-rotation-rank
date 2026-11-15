import type { AppError, BundleData, EngineRequest, EngineResponse } from "@/lib/contract";
import { runEngine } from "@/lib/engine-run";

type WorkerScope = typeof self & {
  postMessage: (message: {
    id: number;
    ok: boolean;
    response?: EngineResponse;
    error?: AppError;
  }) => void;
};

const scope = self as WorkerScope;
scope.onmessage = (
  event: MessageEvent<{ id: number; request: EngineRequest; bundle: BundleData }>,
) => {
  const { id, request, bundle } = event.data;
  try {
    scope.postMessage({ id, ok: true, response: runEngine(request, bundle) });
  } catch (reason) {
    const error =
      reason && typeof reason === "object" && "kind" in reason
        ? (reason as AppError)
        : { kind: "engine_error" as const, detail: "The calculation could not run." };
    scope.postMessage({ id, ok: false, error });
  }
};
