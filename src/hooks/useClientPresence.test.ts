import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPresenceClientId,
  publishClientPresence,
} from "./useClientPresence";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("client presence", () => {
  it("creates distinct ephemeral client identifiers", () => {
    expect(createPresenceClientId()).not.toBe(createPresenceClientId());
  });

  it("publishes visibility with keepalive support", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await publishClientPresence("http://hermes.local/", "tab-1", false, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hermes.local/api/push/presence",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ client_id: "tab-1", visible: false }),
        keepalive: true,
      }),
    );
  });

  it("rejects unsuccessful presence updates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );

    await expect(publishClientPresence("", "tab-1", true)).rejects.toThrow(
      "status 503",
    );
  });
});
