import type { AppError, BundleData, EngineResponse, Plan } from "@/lib/contract";

export type ActualBundle = BundleData;

export type BundleError = AppError;
export type DataMode = "snapshot" | "live";

export type EvidenceContext = {
  title: string;
  detail: string;
  plan?: Plan;
  pointId?: string;
  indicator?: string;
};

export type ViewProps = {
  bundle: ActualBundle | null;
  response: EngineResponse | null;
  retry: () => void;
  loading: boolean;
  error: BundleError | null;
  dataMode: DataMode | null;
  retrievedAt: string | null;
  openEvidence: (context: EvidenceContext) => void;
};
