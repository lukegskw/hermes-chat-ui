import type { ServerConfig } from "./config.js";

export class DashboardImportError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "DashboardImportError";
  }
}

const required = (value: string): string => {
  if (!value) throw new DashboardImportError("dashboard_configuration_missing");
  return value;
};

const jsonObject = async (
  response: Response,
): Promise<Record<string, unknown>> => {
  try {
    const payload: unknown = await response.json();
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, unknown>;
    }
  } catch {
    // Mapped below to a stable integration error.
  }
  throw new DashboardImportError("dashboard_invalid_response");
};

export const importAssistantSession = async (
  config: ServerConfig,
  sessionId: string,
  title: string,
  message: string,
  timestamp = Date.now() / 1000,
): Promise<void> => {
  const dashboardUrl = required(config.dashboardUrl);
  const username = required(config.dashboardUsername);
  const password = required(config.dashboardPassword);
  try {
    const loginResponse = await fetch(`${dashboardUrl}/auth/password-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: config.dashboardAuthProvider || "basic",
        username,
        password,
        next: "/",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if ([401, 403, 404].includes(loginResponse.status)) {
      throw new DashboardImportError("dashboard_authentication_failed");
    }
    if (loginResponse.status !== 200) {
      throw new DashboardImportError("dashboard_unavailable");
    }
    const loginPayload = await jsonObject(loginResponse);
    if (loginPayload.ok !== true) {
      throw new DashboardImportError("dashboard_authentication_failed");
    }
    const cookie = loginResponse.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    const importResponse = await fetch(`${dashboardUrl}/api/sessions/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body: JSON.stringify({
        sessions: [
          {
            id: sessionId,
            source: "proactive",
            title,
            started_at: timestamp,
            ended_at: timestamp,
            end_reason: "proactive_message",
            messages: [
              {
                role: "assistant",
                content: message,
                timestamp,
                finish_reason: "stop",
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if ([401, 403].includes(importResponse.status)) {
      throw new DashboardImportError("dashboard_authentication_failed");
    }
    if (importResponse.status !== 200) {
      throw new DashboardImportError("dashboard_import_failed");
    }
    const result = await jsonObject(importResponse);
    if (
      result.ok !== true ||
      !Array.isArray(result.imported_ids) ||
      !result.imported_ids.includes(sessionId)
    ) {
      throw new DashboardImportError("dashboard_import_rejected");
    }
  } catch (error) {
    if (error instanceof DashboardImportError) throw error;
    throw new DashboardImportError("dashboard_unavailable");
  }
};
