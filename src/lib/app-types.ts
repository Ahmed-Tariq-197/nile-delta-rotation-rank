import type { AppError, EngineResponse, Plan, UiBundle } from "@/lib/contract";

export type ActualBundle = UiBundle;

export type BundleError = AppError;
export type EvidenceContext = { title: string; detail: string; plan?: Plan; pointId?: string; indicator?: string };

export type ViewProps = {
  bundle: ActualBundle | null;
  response: EngineResponse | null;
  retry: () => void;
  loading: boolean;
  error: BundleError | null;
  openEvidence: (context: EvidenceContext) => void;
};