import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchModisBands, fetchModisChunk, fetchModisDates } from "./services";

const location = z.object({
  id: z.string().min(1).max(40),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

const modisDate = z.string().regex(/^A\d{7}$/);

export const getModisDates = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => location.parse(data))
  .handler(async ({ data }) => fetchModisDates(data));

export const getModisBands = createServerFn({ method: "POST" }).handler(async () =>
  fetchModisBands(),
);

export const getModisChunk = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    location.extend({ start: modisDate, end: modisDate }).parse(data),
  )
  .handler(async ({ data }) => fetchModisChunk(data, data.start, data.end));
