import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DashboardImportError } from "../server/dashboard.js";
import { createProactiveMessage } from "../server/proactive.js";
import { testConfig } from "./helpers.js";

const payload = (requestId = "request-1") => ({
  request_id: requestId,
  title: "NAS report",
  message: "Backup completed.",
});

describe("proactive orchestration", () => {
  it("requires a configured matching internal key", async () => {
    const missing = await createProactiveMessage(testConfig(), "", payload());
    expect(missing.status).toBe(503);
    const unauthorized = await createProactiveMessage(
      testConfig({ pushApiKey: "secret" }),
      "",
      payload(),
    );
    expect(unauthorized.status).toBe(401);
  });

  it("imports once, pushes once, and replays idempotently", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hermes-proactive-"));
    const config = testConfig({
      pushApiKey: "secret",
      proactiveRequestsFile: path.join(directory, "requests.json"),
    });
    const importSession = vi.fn().mockResolvedValue(undefined);
    const push = vi
      .fn()
      .mockResolvedValue({ status: "sent", sent: 1, failed: 0 });

    const first = await createProactiveMessage(
      config,
      "Bearer secret",
      payload(),
      { importSession, push },
    );
    const firstBody = await first.json();
    const replay = await createProactiveMessage(
      config,
      "Bearer secret",
      payload(),
      { importSession, push },
    );
    const replayBody = await replay.json();

    expect(firstBody.status).toBe("complete");
    expect(firstBody.session.persisted).toBe(true);
    expect(replayBody.replayed).toBe(true);
    expect(replayBody.session.id).toBe(firstBody.session.id);
    expect(importSession).toHaveBeenCalledOnce();
    expect(push).toHaveBeenCalledOnce();
    expect(push.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        body: "Backup completed.",
        session_id: firstBody.session.id,
        url: `/?session=${encodeURIComponent(firstBody.session.id)}`,
      }),
    );
  });

  it("still pushes a warning when conversation persistence fails", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hermes-proactive-"));
    const config = testConfig({
      pushApiKey: "secret",
      proactiveRequestsFile: path.join(directory, "requests.json"),
    });
    const push = vi
      .fn()
      .mockResolvedValue({ status: "sent", sent: 1, failed: 0 });
    const response = await createProactiveMessage(
      config,
      "Bearer secret",
      payload(),
      {
        importSession: vi
          .fn()
          .mockRejectedValue(new DashboardImportError("dashboard_unavailable")),
        push,
      },
    );
    const body = await response.json();
    expect(body.status).toBe("partial");
    expect(body.session).toEqual({
      persisted: false,
      error: "dashboard_unavailable",
    });
    expect(push.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        body: expect.stringMatching(/^Conversation was not saved\./),
        url: "/",
        session_id: null,
      }),
    );
  });
});
