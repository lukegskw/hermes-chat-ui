import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  PRESENCE_TTL_SECONDS,
  clearClientPresence,
  isAnyClientVisible,
  notificationRoutes,
  updateClientPresence,
} from "../server/notifications.js";
import { testConfig } from "./helpers.js";

beforeEach(clearClientPresence);

describe("push routes", () => {
  it("tracks visible clients and expires stale presence", () => {
    updateClientPresence("stale", true, 10);
    expect(isAnyClientVisible(10)).toBe(true);
    expect(isAnyClientVisible(10 + PRESENCE_TTL_SECONDS + 0.01)).toBe(false);
    updateClientPresence("current", true, 100);
    updateClientPresence("current", false, 101);
    expect(isAnyClientVisible(101)).toBe(false);
  });

  it("fails closed when the internal key is missing or incorrect", async () => {
    const missing = await notificationRoutes.send(testConfig(), "", {
      title: "Report",
      body: "Done",
    });
    expect(missing.status).toBe(503);

    const unauthorized = await notificationRoutes.send(
      testConfig({ pushApiKey: "secret" }),
      "Bearer incorrect",
      { title: "Report", body: "Done" },
    );
    expect(unauthorized.status).toBe(401);
  });

  it("registers, updates, and removes subscriptions", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hermes-push-"));
    const config = testConfig({
      subscriptionsFile: path.join(directory, "subscriptions.json"),
    });
    const subscription = {
      endpoint: "https://push.example/one",
      keys: { p256dh: "key", auth: "auth" },
    };
    expect(
      (await notificationRoutes.subscribe(config, subscription)).status,
    ).toBe(200);
    expect(
      (await notificationRoutes.subscribe(config, subscription)).status,
    ).toBe(200);
    const response = await notificationRoutes.unsubscribe(config, {
      endpoint: subscription.endpoint,
    });
    expect(await response.json()).toEqual({ status: "unsubscribed" });
  });
});
