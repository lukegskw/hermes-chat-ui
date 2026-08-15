import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../server/app.js";
import { testConfig } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Hono BFF contract", () => {
  it("serves liveness without requiring Hermes readiness", async () => {
    const response = await createApp(testConfig()).request("/api/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "ok",
      service: "hermes-chat-ui",
      hermes_api_configured: true,
    });
  });

  it("injects the Hermes key and forwards repeated query parameters", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetcher);
    const app = createApp(
      testConfig({
        hermesApiUrl: "http://hermes-agent:8642",
        hermesApiKey: "api-secret",
      }),
    );
    const response = await app.request(
      "/api/sessions?source=api&source=proactive&limit=50",
    );
    expect(response.status).toBe(200);
    const call = fetcher.mock.calls[0] as [string, RequestInit];
    expect(call[0]).toBe(
      "http://hermes-agent:8642/api/sessions?source=api&source=proactive&limit=50",
    );
    expect(new Headers(call[1].headers).get("Authorization")).toBe(
      "Bearer api-secret",
    );
  });

  it("never serves the SPA for an unknown API route", async () => {
    const response = await createApp(testConfig()).request("/api/missing", {
      headers: { Accept: "text/html" },
    });
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
