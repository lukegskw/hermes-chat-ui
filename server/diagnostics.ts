import type { ServerConfig } from "./config.js";
import {
  CapabilitiesSchema,
  ModelOptionsSchema,
  SessionsResponseSchema,
} from "./hermes-contract.js";

export type DiagnosticResult = {
  check: "configuration" | "capabilities" | "models" | "sessions";
  ok: boolean;
  message: string;
};

class DiagnosticError extends Error {}

const readResponse = async (
  config: ServerConfig,
  path: string,
  fetcher: typeof fetch,
  timeoutMs: number,
): Promise<unknown> => {
  // Never include upstream bodies, URLs, credentials, or raw network errors in
  // reports. They may contain keys, model-provider details, or chat contents.
  let response: Response;
  let payload: unknown;
  try {
    response = await fetcher(`${config.hermesApiUrl}${path}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.hermesApiKey}`,
      },
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) payload = await response.json();
    else await response.body?.cancel();
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new DiagnosticError(
        "Expected a JSON response from the Hermes API.",
      );
    }
    if (
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
    ) {
      throw new DiagnosticError(
        "Request timed out. Check the API address, Docker network, and Hermes logs.",
      );
    }
    throw new DiagnosticError(
      "Cannot reach Hermes. Check the API address, network, TLS, and redirects.",
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new DiagnosticError(
      `HTTP ${response.status}: API key rejected. Match the Hermes key and recreate the UI container.`,
    );
  }
  if (response.status === 404) {
    throw new DiagnosticError(
      "HTTP 404: required endpoint is missing. Check the API URL and Hermes image compatibility.",
    );
  }
  if (!response.ok) {
    throw new DiagnosticError(
      `HTTP ${response.status}: Hermes could not complete this check. Inspect its logs.`,
    );
  }
  return payload;
};

/** Read-only checks: no sessions created, no messages sent, no model invoked. */
export const checkHermes = async (
  config: ServerConfig,
  fetcher: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<DiagnosticResult[]> => {
  const results: DiagnosticResult[] = [];
  const record = (
    check: DiagnosticResult["check"],
    ok: boolean,
    message: string,
  ) => results.push({ check, ok, message });

  let url: URL;
  try {
    url = new URL(config.hermesApiUrl);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      throw new Error("Invalid API URL");
    }
  } catch {
    record(
      "configuration",
      false,
      "Set HERMES_API_URL to an HTTP(S) base URL without credentials, query, or fragment.",
    );
    return results;
  }
  if (!config.hermesApiKey.trim()) {
    record(
      "configuration",
      false,
      "Set API_SERVER_KEY or HERMES_API_KEY to the key configured in Hermes.",
    );
    return results;
  }
  record("configuration", true, "API address and key are configured.");

  const checks = [
    {
      name: "capabilities",
      path: "/v1/capabilities",
      schema: CapabilitiesSchema,
      success: "Required session and model capabilities are advertised.",
      failure:
        "Hermes does not advertise the capabilities required by this UI.",
    },
    {
      name: "models",
      path: "/api/model/options",
      schema: ModelOptionsSchema,
      success: "Model catalog matches the UI response format.",
      failure: "Model catalog response does not match the UI response format.",
    },
    {
      name: "sessions",
      path: "/api/sessions?limit=1",
      schema: SessionsResponseSchema,
      success: "Session list matches the UI response format.",
      failure: "Session list response does not match the UI response format.",
    },
  ] as const;

  for (const check of checks) {
    try {
      const payload = await readResponse(
        config,
        check.path,
        fetcher,
        timeoutMs,
      );
      if (!check.schema.safeParse(payload).success) {
        throw new DiagnosticError(check.failure);
      }
      record(check.name, true, check.success);
    } catch (error) {
      record(
        check.name,
        false,
        error instanceof DiagnosticError
          ? error.message
          : "Check failed. Inspect the Hermes configuration and logs.",
      );
      break;
    }
  }
  return results;
};
