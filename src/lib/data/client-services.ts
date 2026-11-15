import type { BandMeta, ModisDate, SubsetRecord } from "./modis";
import { getModisBands, getModisChunk, getModisDates } from "./modis.functions";
import { getPowerPoint } from "./power.functions";
import type { PowerPointResult } from "./power";
import type { DataServices } from "./services";
import type { Result } from "./types";

/** Data services that run on the application server, so the browser never calls NASA directly. */
export const serverServices: DataServices = {
  power: async (point, end) =>
    (await getPowerPoint({
      data: { id: point.id, latitude: point.latitude, longitude: point.longitude, end },
    })) as Result<PowerPointResult>,
  modisDates: async (point) =>
    (await getModisDates({
      data: { id: point.id, latitude: point.latitude, longitude: point.longitude },
    })) as Result<ModisDate[]>,
  modisBands: async () => (await getModisBands()) as Result<BandMeta>,
  modisChunk: async (point, start, end) =>
    (await getModisChunk({
      data: { id: point.id, latitude: point.latitude, longitude: point.longitude, start, end },
    })) as Result<SubsetRecord[]>,
};
