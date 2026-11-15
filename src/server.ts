import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

async function normalizeCatastrophicResponse(response: Response): Promise<Response> {
  if (response.status < 500 || !(response.headers.get("content-type") ?? "").includes("application/json")) {
    return response;
  }

  const body = await response.clone().text();
  let isSwallowedError = false;
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    isSwallowedError = payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return response;
  }

  if (!isSwallowedError) return response;
  console.error(consumeLastCapturedError() ?? new Error(`Request handler failed: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
