import { describe, expect, it, vi } from "vitest";
import { checkHermes } from "../server/diagnostics.js";
import { testConfig } from "./helpers.js";

const capabilities = {
  features: {
    session_resources: true,
    session_chat: true,
    session_chat_streaming: true,
    model_options: true,
    session_model_lock: true,
  },
  endpoints: {
    sessions: { path: "/api/sessions" },
    session_create: { path: "/api/sessions" },
    session_delete: { path: "/api/sessions/{session_id}" },
    session_messages: { path: "/api/sessions/{session_id}/messages" },
    session_chat_stream: {
      path: "/api/sessions/{session_id}/chat/stream",
    },
    model_options: { path: "/api/model/options" },
    session_model_lock: { path: "/api/sessions/{session_id}/model" },
  },
};

describe("Hermes deployment diagnostics", () => {
  it("checks the exact response shapes used by the browser", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(capabilities))
      .mockResolvedValueOnce(
        Response.json({ providers: [], reasoning_efforts: null }),
      )
      .mockResolvedValueOnce(Response.json({ data: [], has_more: false }));

    const results = await checkHermes(
      testConfig({
        hermesApiUrl: "http://hermes-agent:8642",
        hermesApiKey: "secret",
      }),
      fetcher,
    );

    expect(results).toEqual([
      expect.objectContaining({ check: "configuration", ok: true }),
      expect.objectContaining({ check: "capabilities", ok: true }),
      expect.objectContaining({ check: "models", ok: true }),
      expect.objectContaining({ check: "sessions", ok: true }),
    ]);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [, options] of fetcher.mock.calls) {
      expect(new Headers(options?.headers).get("Authorization")).toBe(
        "Bearer secret",
      );
      expect(options?.redirect).toBe("error");
    }
  });

  it("stops after a capability mismatch", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ ...capabilities, features: {} }));
    const results = await checkHermes(
      testConfig({ hermesApiKey: "secret" }),
      fetcher,
    );

    expect(results.at(-1)).toEqual({
      check: "capabilities",
      ok: false,
      message:
        "Hermes does not advertise the capabilities required by this UI.",
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("reports authentication failure without exposing config or response data", async () => {
    const response = Response.json(
      { detail: "secret upstream response" },
      { status: 401 },
    );
    const results = await checkHermes(
      testConfig({
        hermesApiUrl: "http://private-hermes.example:8642",
        hermesApiKey: "do-not-print-this-key",
      }),
      vi.fn<typeof fetch>().mockResolvedValue(response),
    );
    const serialized = JSON.stringify(results);

    expect(results.at(-1)).toEqual({
      check: "capabilities",
      ok: false,
      message:
        "HTTP 401: API key rejected. Match the Hermes key and recreate the UI container.",
    });
    expect(serialized).not.toContain("do-not-print-this-key");
    expect(serialized).not.toContain("secret upstream response");
    expect(serialized).not.toContain("private-hermes.example");
  });

  it("rejects credentials embedded in the API URL before making a request", async () => {
    const fetcher = vi.fn<typeof fetch>();
    const results = await checkHermes(
      testConfig({
        hermesApiUrl: "http://user:password@hermes-agent:8642",
        hermesApiKey: "secret",
      }),
      fetcher,
    );

    expect(results).toEqual([
      expect.objectContaining({ check: "configuration", ok: false }),
    ]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
