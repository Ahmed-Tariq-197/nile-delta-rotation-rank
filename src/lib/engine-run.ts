import type { AppError, BundleData, EngineRequest, EngineResponse } from "@/lib/contract";
import { EngineError, evaluate, validateResponse } from "@/engine";
import type { EngineBundle } from "@/engine";

const MESSAGES: Record<string, string> = {
  UNKNOWN_POINT: "This location is not in the data bundle.",
  INVALID_REQUEST: "These inputs are not valid. Check the priorities, salinity and water cap.",
  NO_FEASIBLE_PLAN:
    "No rotation fits these limits. Allow at least one winter and one summer crop, or raise the water cap.",
  DATA_GAP: "The data for this location are incomplete, so plans cannot be calculated.",
};

export function engineErrorMessage(reason: unknown): AppError {
  if (reason instanceof EngineError || (reason && typeof reason === "object" && "code" in reason)) {
    const code = String((reason as { code: unknown }).code);
    const detail = (reason as { message?: string }).message ?? "";
    return { kind: "engine_error", detail: MESSAGES[code] ?? detail, code };
  }
  return {
    kind: "engine_error",
    detail: reason instanceof Error ? reason.message : "The calculation could not run.",
  };
}

/** Run the engine and check its response. Throws an AppError. */
export function runEngine(request: EngineRequest, bundle: BundleData): EngineResponse {
  let response: EngineResponse;
  try {
    response = evaluate(request, bundle as unknown as EngineBundle) as EngineResponse;
  } catch (reason) {
    throw engineErrorMessage(reason);
  }
  const check = validateResponse(response);
  if (!check.ok)
    throw {
      kind: "engine_error",
      detail: `The result failed its checks: ${check.errors.join(" ")}`,
    };
  return response;
}
