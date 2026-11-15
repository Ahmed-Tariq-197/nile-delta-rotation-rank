import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { fetchPowerPoint } from "./services";

const pointInput = z.object({
  id: z.string().min(1).max(40),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  end: z.string().regex(/^\d{8}$/),
});

/** NASA POWER daily point data for one location, cleaned and converted to canonical units. */
export const getPowerPoint = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pointInput.parse(data))
  .handler(async ({ data }) => fetchPowerPoint(data, data.end));
