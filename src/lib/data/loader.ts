import type { BundleData, ConfigFile, Point, PointsFile } from "@/lib/contract";

import { assembleBundle, type NdviPointResult } from "./bundle";
import { buildNdviFile, chunkDates, selectDates, type BandMeta, type SubsetRecord } from "./modis";
import { powerEndDate, type PowerPointResult } from "./power";
import type { DataServices } from "./services";
import { isRecord, type ServiceError } from "./types";
import { validateBundleData, validateConfig, validatePoints } from "./validate";

export type PowerStatus = "waiting" | "loading" | "ready" | "failed";
export type VegetationStatus = "waiting" | "loading" | "ready" | "unavailable";

export interface LocationProgress {
  point_id: string;
  area: string;
  power: PowerStatus;
  power_error?: ServiceError | undefined;
  vegetation: VegetationStatus;
  vegetation_detail?: string | undefined;
  chunks_done: number;
  chunks_total: number;
}

export type LoadState =
  | { phase: "loading"; message: string; locations: LocationProgress[] }
  | { phase: "config_missing"; file: string; detail: string }
  | { phase: "failed"; error: ServiceError; locations: LocationProgress[] }
  | {
      phase: "ready";
      mode: "snapshot" | "live";
      bundle: BundleData;
      retrievedAt: string;
      locations: LocationProgress[];
      vegetationPending: boolean;
      notices: string[];
    };

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface LoaderOptions {
  services: DataServices;
  dataBase: string;
  onUpdate: (state: LoadState) => void;
  fetchImpl?: FetchLike;
  now?: () => Date;
  maxConcurrent?: number;
}

type StaticRead =
  | { ok: true; value: unknown }
  | { ok: false; status: "missing" | "network" | "invalid_json"; detail: string };

export async function readStaticJson(
  url: string,
  fetchImpl: FetchLike = fetch,
): Promise<StaticRead> {
  let response: Response;
  try {
    response = await fetchImpl(url, { cache: "no-store" });
  } catch {
    return { ok: false, status: "network", detail: "The file could not be reached." };
  }
  if (response.status === 404)
    return { ok: false, status: "missing", detail: "The file was not found (404)." };
  if (!response.ok)
    return {
      ok: false,
      status: "network",
      detail: `The file request returned status ${response.status}.`,
    };
  const text = await response.text().catch(() => null);
  if (text === null) return { ok: false, status: "network", detail: "The file could not be read." };
  // Static hosts and dev servers may answer a missing file with the app page instead of a 404.
  if (/^\s*</.test(text))
    return { ok: false, status: "missing", detail: "The file was not found." };
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, status: "invalid_json", detail: "The file is not valid JSON." };
  }
}

function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => queue.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      queue.shift()?.();
    }
  };
}

function asServiceError(
  reason: unknown,
  service: ServiceError["service"],
  pointId?: string,
): ServiceError {
  if (
    isRecord(reason) &&
    typeof reason["message"] === "string" &&
    typeof reason["code"] === "string"
  )
    return reason as unknown as ServiceError;
  return {
    service,
    code: "network",
    message: `${service} could not be reached through the application server.`,
    ...(pointId ? { point_id: pointId } : {}),
  };
}

/**
 * Load the data bundle: a valid frozen snapshot first, otherwise assemble it live from
 * NASA POWER and MODIS. Reports progress per location. Never throws.
 */
export function createBundleLoader(options: LoaderOptions) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const limit = limiter(options.maxConcurrent ?? 2);
  let config: ConfigFile | null = null;
  let pointsFile: PointsFile | null = null;
  let locations: LocationProgress[] = [];
  const power: Record<string, PowerPointResult> = {};
  const ndvi: Record<string, NdviPointResult> = {};
  let bandMeta: BandMeta | null = null;
  let endDate = "";
  let retrievedAt = "";
  const notices: string[] = [];
  let stopped = false;
  let generation = 0;

  const emit = (state: LoadState) => {
    if (!stopped) options.onUpdate(state);
  };
  const update = (id: string, patch: Partial<LocationProgress>) => {
    locations = locations.map((item) => (item.point_id === id ? { ...item, ...patch } : item));
  };
  const vegetationPending = () =>
    locations.some((item) => item.vegetation === "waiting" || item.vegetation === "loading");

  let lastBundle: BundleData | null = null;

  /** Re-emit the current bundle with updated per-location progress, without reassembling it. */
  function emitProgress() {
    if (lastBundle)
      emit({
        phase: "ready",
        mode: "live",
        bundle: lastBundle,
        retrievedAt,
        locations,
        vegetationPending: vegetationPending(),
        notices: [...notices],
      });
  }

  async function publish() {
    if (!config || !pointsFile) return;
    const ready = Object.keys(power).length;
    if (!ready) {
      const first = locations.find((item) => item.power_error)?.power_error;
      emit(
        first
          ? { phase: "failed", error: first, locations }
          : { phase: "loading", message: "Requesting NASA POWER climate series.", locations },
      );
      return;
    }
    const current = ++generation;
    const warnings = [...notices];
    const bundle = await assembleBundle({
      points: pointsFile,
      config,
      power,
      ndvi,
      bandMeta,
      retrievedAt,
      warnings,
    });
    if (current !== generation) return;
    lastBundle = bundle;
    emit({
      phase: "ready",
      mode: "live",
      bundle,
      retrievedAt,
      locations,
      vegetationPending: vegetationPending(),
      notices: [...notices],
    });
  }

  async function loadPower(point: Point) {
    update(point.id, { power: "loading", power_error: undefined });
    if (lastBundle) emitProgress();
    else emit({ phase: "loading", message: "Requesting NASA POWER climate series.", locations });
    const result = await limit(() => options.services.power(point, endDate)).catch(
      (reason: unknown) => ({
        ok: false as const,
        error: asServiceError(reason, "NASA POWER", point.id),
      }),
    );
    if (result.ok) {
      power[point.id] = result.value;
      update(point.id, { power: "ready" });
    } else {
      update(point.id, { power: "failed", power_error: { ...result.error, point_id: point.id } });
    }
  }

  async function loadVegetation(point: Point) {
    update(point.id, {
      vegetation: "loading",
      vegetation_detail: "Listing composite dates.",
      chunks_done: 0,
      chunks_total: 0,
    });
    emitProgress();
    const unavailable = async (detail: string) => {
      ndvi[point.id] = { file: null, status: { status: "unavailable", detail } };
      update(point.id, { vegetation: "unavailable", vegetation_detail: detail });
      await publish();
    };
    try {
      if (!bandMeta) {
        const bands = await limit(() => options.services.modisBands());
        if (bands.ok) bandMeta = bands.value;
      }
      const meta = bandMeta;
      if (!meta) return unavailable("Band metadata could not be read.");
      const dates = await limit(() => options.services.modisDates(point));
      if (!dates.ok) return unavailable(dates.error.message);
      const climateEnd =
        power[point.id]?.climate.end ??
        `${endDate.slice(0, 4)}-${endDate.slice(4, 6)}-${endDate.slice(6, 8)}`;
      const selected = selectDates(dates.value, climateEnd);
      if (!selected.length) return unavailable("No composites fall inside the climate period.");
      const chunks = chunkDates(selected);
      update(point.id, {
        chunks_total: chunks.length,
        vegetation_detail: `Reading ${chunks.length} groups of composites.`,
      });
      emitProgress();
      const records: SubsetRecord[] = [];
      let done = 0;
      const results = await Promise.all(
        chunks.map((chunk) =>
          limit(async () => {
            const first = chunk[0];
            const last = chunk[chunk.length - 1];
            if (!first || !last) return { ok: true as const, value: [] as SubsetRecord[] };
            const result = await options.services.modisChunk(
              point,
              first.modis_date,
              last.modis_date,
            );
            done += 1;
            update(point.id, { chunks_done: done });
            emitProgress();
            return result;
          }),
        ),
      );
      const failure = results.find((item) => !item.ok);
      if (failure && !failure.ok) return unavailable(failure.error.message);
      for (const item of results) if (item.ok) records.push(...item.value);
      const file = buildNdviFile(point.id, selected, records, meta);
      const valid = file.quality_ok.filter(Boolean).length;
      ndvi[point.id] = {
        file,
        status: {
          status: "available",
          detail: `${file.composite_dates.length} composites, ${valid} pass the quality check; retrieved ${new Date().toISOString()}.`,
        },
      };
      update(point.id, { vegetation: "ready", vegetation_detail: undefined });
      await publish();
    } catch (reason) {
      await unavailable(asServiceError(reason, "MODIS (ORNL DAAC)", point.id).message);
    }
  }

  async function loadLive() {
    const base = options.dataBase;
    const [configRead, pointsRead] = await Promise.all([
      readStaticJson(`${base}config.json`, fetchImpl),
      readStaticJson(`${base}points.json`, fetchImpl),
    ]);
    if (!configRead.ok) {
      emit({
        phase: "config_missing",
        file: "public/data/config.json",
        detail:
          configRead.status === "invalid_json"
            ? "The configuration file is not valid JSON."
            : configRead.status === "missing"
              ? "The configuration file is missing."
              : `The configuration file could not be loaded. ${configRead.detail}`,
      });
      return;
    }
    const configCheck = validateConfig(configRead.value);
    if (!configCheck.ok) {
      emit({
        phase: "config_missing",
        file: "public/data/config.json",
        detail: `The configuration file does not match the expected shape. ${configCheck.errors.join(" ")}`,
      });
      return;
    }
    if (!pointsRead.ok) {
      emit({
        phase: "failed",
        locations: [],
        error: {
          service: "Locations",
          code: pointsRead.status === "invalid_json" ? "invalid_json" : "not_found",
          message: `public/data/points.json: ${pointsRead.detail}`,
        },
      });
      return;
    }
    const pointsCheck = validatePoints(pointsRead.value);
    if (!pointsCheck.ok) {
      emit({
        phase: "failed",
        locations: [],
        error: {
          service: "Locations",
          code: "invalid_response",
          message: `public/data/points.json does not match the expected shape. ${pointsCheck.errors.join(" ")}`,
        },
      });
      return;
    }
    config = configCheck.value;
    pointsFile = pointsCheck.value;
    endDate = powerEndDate(now());
    retrievedAt = now().toISOString();
    locations = pointsFile.points.map((point) => ({
      point_id: point.id,
      area: point.area,
      power: "waiting",
      vegetation: "waiting",
      chunks_done: 0,
      chunks_total: 0,
    }));
    emit({ phase: "loading", message: "Requesting NASA POWER climate series.", locations });
    await Promise.all(pointsFile.points.map(loadPower));
    await publish();
    if (!Object.keys(power).length) return;
    for (const point of pointsFile.points) {
      if (power[point.id]) void loadVegetation(point);
      else {
        ndvi[point.id] = {
          file: null,
          status: {
            status: "unavailable",
            detail: "Not requested because climate is unavailable.",
          },
        };
        update(point.id, {
          vegetation: "unavailable",
          vegetation_detail: "Not requested because climate is unavailable.",
        });
      }
    }
  }

  return {
    async start() {
      emit({ phase: "loading", message: "Looking for a frozen data snapshot.", locations: [] });
      const snapshot = await readStaticJson(`${options.dataBase}snapshot.json`, fetchImpl);
      if (snapshot.ok) {
        const check = validateBundleData(snapshot.value);
        if (check.ok) {
          emit({
            phase: "ready",
            mode: "snapshot",
            bundle: check.value,
            retrievedAt: check.value.manifest.built_at_utc,
            locations: [],
            vegetationPending: false,
            notices: [],
          });
          return;
        }
        notices.push(
          `snapshot.json was found but did not validate, so the data were assembled live. ${check.errors.slice(0, 3).join(" ")}`,
        );
      } else if (snapshot.status === "invalid_json") {
        notices.push(
          "snapshot.json was found but is not valid JSON, so the data were assembled live.",
        );
      }
      await loadLive();
    },
    /** Retry the climate request for one location, then its vegetation record. */
    async retryPoint(pointId: string) {
      const point = pointsFile?.points.find((item) => item.id === pointId);
      if (!point) return;
      await loadPower(point);
      await publish();
      if (power[point.id]) void loadVegetation(point);
    },
    async retryVegetation(pointId: string) {
      const point = pointsFile?.points.find((item) => item.id === pointId);
      if (point && power[point.id]) await loadVegetation(point);
    },
    stop() {
      stopped = true;
    },
  };
}

export type BundleLoader = ReturnType<typeof createBundleLoader>;
