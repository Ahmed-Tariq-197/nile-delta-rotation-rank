import type { BundleData } from "@/lib/contract";
import { formatDate, formatDateTime } from "@/lib/format";

export function sourceSentence(bundle: BundleData, retrievedAt: string | null) {
  const end = bundle.manifest.data.end_date
    ? formatDate(bundle.manifest.data.end_date)
    : "date not stated";
  return `NASA POWER and MODIS, latest available through ${end}, retrieved ${retrievedAt ? formatDateTime(retrievedAt) : "at an unstated time"}.`;
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
