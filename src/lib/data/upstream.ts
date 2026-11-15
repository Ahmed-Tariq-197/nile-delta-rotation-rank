import { fail, ok, type Result, type ServiceName } from "./types";

export const USER_AGENT = "RotaNile/0.1 (Nile Orbit Lab research demonstration; contact via project page)";
export const CACHE_LIFETIME_MS = 6 * 60 * 60 * 1000;
export const MAX_CONCURRENT = 2;
export const MAX_RETRIES = 3;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface UpstreamOptions {
  service: ServiceName;
  timeoutMs: number;
  pointId?: string;
  retries?: number;
  baseDelayMs?: number;
  fetchImpl?: FetchLike;
  now?: () => number;
}

const cache = new Map<string, { expires: number; value: unknown }>();
const inFlight = new Map<string, Promise<Result<unknown>>>();
let active = 0;
const queue: (() => void)[] = [];

async function acquire() {
  if (active < MAX_CONCURRENT) {
    active += 1;
    return;
  }
  await new Promise<void>((resolve) => queue.push(resolve));
  active += 1;
}

function release() {
  active -= 1;
  queue.shift()?.();
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function clearUpstreamCache() {
  cache.clear();
  inFlight.clear();
}

async function attempt(url: string, options: UpstreamOptions): Promise<Result<unknown> & { retry?: boolean }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  const base = { service: options.service, url, ...(options.pointId ? { point_id: options.pointId } : {}) };
  let response: Response;
  await acquire();
  try {
    response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": USER_AGENT },
    });
  } catch {
    clearTimeout(timer);
    release();
    const timedOut = controller.signal.aborted;
    return {
      ...fail({
        ...base,
        code: timedOut ? "timeout" : "network",
        message: timedOut
          ? `${options.service} did not answer within ${Math.round(options.timeoutMs / 1000)} seconds.`
          : `${options.service} could not be reached.`,
      }),
      retry: true,
    };
  }
  try {
    if (response.status === 404) {
      return fail({ ...base, code: "not_found", status: 404, message: `${options.service} returned 404 (not found).` });
    }
    if (!response.ok) {
      return {
        ...fail({ ...base, code: "http", status: response.status, message: `${options.service} returned status ${response.status}.` }),
        retry: response.status === 429 || response.status >= 500,
      };
    }
    try {
      return ok(await response.json());
    } catch {
      const timedOut = controller.signal.aborted;
      return {
        ...fail({
          ...base,
          code: timedOut ? "timeout" : "invalid_json",
          message: timedOut
            ? `${options.service} did not finish answering within ${Math.round(options.timeoutMs / 1000)} seconds.`
            : `${options.service} returned a response that is not valid JSON.`,
        }),
        retry: timedOut,
      };
    }
  } finally {
    clearTimeout(timer);
    release();
  }
}

/**
 * GET a JSON document with a timeout, up to three retries with exponential backoff,
 * at most two concurrent upstream requests, and a six-hour in-memory cache keyed by URL.
 * Concurrent calls for the same URL share one upstream request. Never throws.
 */
export function fetchUpstreamJson(url: string, options: UpstreamOptions): Promise<Result<unknown>> {
  const now = options.now ?? Date.now;
  const cached = cache.get(url);
  if (cached && cached.expires > now()) return Promise.resolve(ok(cached.value));
  const pending = inFlight.get(url);
  if (pending) return pending;
  const retries = options.retries ?? MAX_RETRIES;
  const baseDelay = options.baseDelayMs ?? 1000;
  const run = (async () => {
    let last: Result<unknown> & { retry?: boolean } = await attempt(url, options);
    for (let index = 0; !last.ok && last.retry && index < retries; index += 1) {
      await wait(baseDelay * 2 ** index);
      last = await attempt(url, options);
    }
    if (last.ok) cache.set(url, { expires: now() + CACHE_LIFETIME_MS, value: last.value });
    return last.ok ? ok(last.value) : fail(last.error);
  })().finally(() => inFlight.delete(url));
  inFlight.set(url, run);
  return run;
}
