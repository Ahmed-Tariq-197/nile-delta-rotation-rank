/**
 * Retrieve NASA POWER and MODIS data for the locations in public/data/points.json and
 * write the complete BundleData to public/data/snapshot.json (a frozen snapshot).
 * Usage: bun scripts/build-snapshot.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { createBundleLoader, type LoadState } from "../src/lib/data/loader";
import { directServices } from "../src/lib/data/services";

const dataDir = join(import.meta.dir, "..", "public", "data");

async function localFetch(input: string): Promise<Response> {
  const name = input.replace("local:", "");
  if (name === "snapshot.json") return new Response("not found", { status: 404 });
  try {
    return new Response(await readFile(join(dataDir, name), "utf8"), { status: 200 });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

function summary(state: LoadState) {
  if (state.phase !== "ready" && state.phase !== "loading") return state.phase;
  return state.locations
    .map(
      (item) =>
        `${item.point_id}: power ${item.power}, vegetation ${item.vegetation} ${item.chunks_done}/${item.chunks_total}`,
    )
    .join(" | ");
}

let last = "";
const finished = new Promise<LoadState>((resolve) => {
  const loader = createBundleLoader({
    services: directServices,
    dataBase: "local:",
    fetchImpl: localFetch,
    onUpdate: (state) => {
      const line = summary(state);
      if (line !== last) console.log(new Date().toISOString(), line);
      last = line;
      if (state.phase === "config_missing" || state.phase === "failed") resolve(state);
      if (state.phase === "ready" && !state.vegetationPending) resolve(state);
    },
  });
  void loader.start();
});

const state = await finished;
if (state.phase !== "ready") {
  console.error("Snapshot not written:", JSON.stringify(state));
  process.exit(1);
}
const failedPower = state.locations.filter((item) => item.power !== "ready");
if (failedPower.length) {
  console.error(
    "Snapshot not written: climate missing for",
    failedPower.map((item) => item.point_id).join(", "),
  );
  process.exit(1);
}
await writeFile(join(dataDir, "snapshot.json"), JSON.stringify(state.bundle));
console.log("Wrote public/data/snapshot.json", state.bundle.manifest.bundle_version);
for (const warning of state.bundle.manifest.warnings) console.log("warning:", warning);
