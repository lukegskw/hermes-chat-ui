import type { ServerConfig } from "./config.js";

export const hermesHeaders = (
  config: ServerConfig,
  accept = "application/json",
): Headers => {
  const headers = new Headers({ Accept: accept });
  if (config.hermesApiKey) {
    headers.set("Authorization", `Bearer ${config.hermesApiKey}`);
  }
  return headers;
};

export const hermesUrl = (
  config: ServerConfig,
  pathname: string,
  query?: string,
): string => `${config.hermesApiUrl}${pathname}${query ? `?${query}` : ""}`;

export const unavailableResponse = (error: unknown): Response =>
  Response.json(
    {
      detail: "Hermes Agent is unavailable",
      code: "hermes_unavailable",
      error: error instanceof Error ? error.message : String(error),
    },
    { status: 503 },
  );

export const proxyHermes = async (
  config: ServerConfig,
  method: string,
  pathname: string,
  options: { query?: string; payload?: unknown; timeoutMs?: number } = {},
): Promise<Response> => {
  try {
    const upstream = await fetch(hermesUrl(config, pathname, options.query), {
      method,
      headers: {
        ...Object.fromEntries(hermesHeaders(config)),
        ...(options.payload === undefined
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        options.payload === undefined
          ? undefined
          : JSON.stringify(options.payload),
      signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
    });
    const headers = new Headers();
    const contentType = upstream.headers.get("Content-Type");
    const sessionId = upstream.headers.get("X-Hermes-Session-Id");
    if (contentType) headers.set("Content-Type", contentType);
    if (sessionId) headers.set("X-Hermes-Session-Id", sessionId);
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    return unavailableResponse(error);
  }
};

export const safeJsonBody = async (request: Request): Promise<unknown> => {
  try {
    return await request.json();
  } catch {
    return {};
  }
};
