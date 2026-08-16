import { describe, expect, it } from "vitest";
import {
  NAVIGATION_TARGET_TTL_MS,
  validPendingSessionTarget,
} from "./pendingSessionNavigation";

describe("pending notification navigation", () => {
  it("accepts a recent target", () => {
    expect(
      validPendingSessionTarget(
        { sessionId: "proactive-1", clickedAt: 1_000 },
        2_000,
      ),
    ).toEqual({ sessionId: "proactive-1", clickedAt: 1_000 });
  });

  it("rejects expired, future, and malformed targets", () => {
    expect(
      validPendingSessionTarget(
        { sessionId: "old", clickedAt: 1_000 },
        1_000 + NAVIGATION_TARGET_TTL_MS + 1,
      ),
    ).toBeNull();
    expect(
      validPendingSessionTarget(
        { sessionId: "future", clickedAt: 62_000 },
        1_000,
      ),
    ).toBeNull();
    expect(
      validPendingSessionTarget({ sessionId: "", clickedAt: 1 }),
    ).toBeNull();
  });
});
