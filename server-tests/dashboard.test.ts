import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DashboardImportError,
  importAssistantSession,
} from "../server/dashboard.js";
import { testConfig } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

const config = testConfig({
  dashboardUrl: "http://hermes-agent:9119",
  dashboardAuthProvider: "basic",
  dashboardUsername: "lucas",
  dashboardPassword: "secret",
});

describe("dashboard import", () => {
  it("logs in and imports a literal assistant message", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": "session=abc; Path=/; HttpOnly",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({ ok: true, imported_ids: ["proactive_1"] }),
      );
    vi.stubGlobal("fetch", fetcher);

    await importAssistantSession(
      config,
      "proactive_1",
      "NAS report",
      "Backup completed.",
      123,
    );

    expect(fetcher).toHaveBeenCalledTimes(2);
    const importCall = fetcher.mock.calls[1] as [string, RequestInit];
    expect(importCall[0]).toBe("http://hermes-agent:9119/api/sessions/import");
    expect((importCall[1].headers as Record<string, string>).Cookie).toBe(
      "session=abc",
    );
    const payload = JSON.parse(String(importCall[1].body));
    expect(payload.sessions[0].messages).toEqual([
      {
        role: "assistant",
        content: "Backup completed.",
        timestamp: 123,
        finish_reason: "stop",
      },
    ]);
  });

  it("maps authentication failures without leaking credentials", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ ok: false }, { status: 401 })),
    );
    await expect(
      importAssistantSession(
        config,
        "proactive_1",
        "NAS report",
        "Backup completed.",
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<DashboardImportError>>({
        code: "dashboard_authentication_failed",
      }),
    );
  });
});
