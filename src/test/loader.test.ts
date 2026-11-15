import { beforeEach, describe, expect, it } from "vitest";

import { assembleBundle } from "@/lib/data/bundle";
import { createBundleLoader, type LoadState } from "@/lib/data/loader";
import { parsePowerResponse } from "@/lib/data/power";
import type { DataServices } from "@/lib/data/services";
import { clearUpstreamCache, fetchUpstreamJson } from "@/lib/data/upstream";
import { syntheticConfig, syntheticPoints, syntheticPowerResponse } from "./fixtures/synthetic";

const services: DataServices = {
  power: async (point) =>
    parsePowerResponse(
      syntheticPowerResponse(),
      point.id,
      "https://example.test",
      "2026-01-01T00:00:00Z",
    ),
  modisDates: async () => ({
    ok: false,
    error: { service: "MODIS (ORNL DAAC)", code: "network", message: "offline in test" },
  }),
  modisBands: async () => ({
    ok: false,
    error: { service: "MODIS (ORNL DAAC)", code: "network", message: "offline in test" },
  }),
  modisChunk: async () => ({ ok: true, value: [] }),
};

function files(map: Record<string, unknown>) {
  return async (url: string) => {
    const name = url.replace("test:", "");
    if (!(name in map)) return new Response("not found", { status: 404 });
    const body = map[name];
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200 });
  };
}

function run(map: Record<string, unknown>) {
  return new Promise<LoadState[]>((resolve) => {
    const states: LoadState[] = [];
    const loader = createBundleLoader({
      services,
      dataBase: "test:",
      fetchImpl: files(map),
      now: () => new Date("2026-01-11T00:00:00Z"),
      onUpdate: (state) => {
        states.push(state);
        if (state.phase === "config_missing" || state.phase === "failed") resolve(states);
        if (state.phase === "ready" && !state.vegetationPending) resolve(states);
      },
    });
    void loader.start();
  });
}

describe("bundle loader", () => {
  it("uses a valid snapshot and reports frozen mode", async () => {
    const snapshot = await assembleBundle({
      points: syntheticPoints(),
      config: syntheticConfig(),
      power: Object.fromEntries(
        ["a", "b", "c"].map((id) => {
          const result = parsePowerResponse(syntheticPowerResponse(), id, "u", "t");
          if (!result.ok) throw new Error("fixture");
          return [id, result.value];
        }),
      ),
      ndvi: {},
      bandMeta: null,
      retrievedAt: "2026-01-01T00:00:00Z",
    });
    const states = await run({ "snapshot.json": snapshot });
    const last = states.at(-1);
    expect(last?.phase === "ready" && last.mode).toBe("snapshot");
  });

  it("assembles live when the snapshot is invalid, and says so", async () => {
    const states = await run({
      "snapshot.json": "{not json",
      "config.json": syntheticConfig(),
      "points.json": syntheticPoints(),
    });
    const last = states.at(-1);
    expect(last?.phase).toBe("ready");
    if (last?.phase === "ready") {
      expect(last.mode).toBe("live");
      expect(last.notices.join(" ")).toContain("not valid JSON");
      expect(last.bundle.manifest.data.end_date).toBe("2020-01-03");
      expect(last.locations.every((item) => item.vegetation === "unavailable")).toBe(true);
    }
  });

  it("shows the configuration-missing state naming the file", async () => {
    const states = await run({ "points.json": syntheticPoints() });
    const last = states.at(-1);
    expect(last?.phase).toBe("config_missing");
    if (last?.phase === "config_missing") expect(last.file).toBe("public/data/config.json");
  });
});

describe("upstream requests", () => {
  beforeEach(() => clearUpstreamCache());
  const options = { service: "NASA POWER" as const, timeoutMs: 1000, baseDelayMs: 1 };

  it("returns a structured network error after retries", async () => {
    let calls = 0;
    const result = await fetchUpstreamJson("https://example.test/a", {
      ...options,
      fetchImpl: async () => {
        calls += 1;
        throw new TypeError("offline");
      },
    });
    expect(calls).toBe(4);
    expect(!result.ok && result.error.code).toBe("network");
  });

  it("returns a structured 404 without retrying", async () => {
    let calls = 0;
    const result = await fetchUpstreamJson("https://example.test/b", {
      ...options,
      fetchImpl: async () => {
        calls += 1;
        return new Response("", { status: 404 });
      },
    });
    expect(calls).toBe(1);
    expect(!result.ok && result.error.code).toBe("not_found");
  });

  it("returns a structured error for invalid JSON", async () => {
    const result = await fetchUpstreamJson("https://example.test/c", {
      ...options,
      fetchImpl: async () => new Response("<html>", { status: 200 }),
    });
    expect(!result.ok && result.error.code).toBe("invalid_json");
  });

  it("caches a success so the same request is not sent twice", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return new Response('{"x":1}', { status: 200 });
    };
    await fetchUpstreamJson("https://example.test/d", { ...options, fetchImpl });
    await fetchUpstreamJson("https://example.test/d", { ...options, fetchImpl });
    expect(calls).toBe(1);
  });
});
