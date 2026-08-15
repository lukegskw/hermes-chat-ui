import { describe, expect, it } from "vitest";
import type { Conversation } from "../types";
import { mergeSessions, sortSessions } from "./sessionListReconciliation";

const session = (
  id: string,
  lastActive: number,
  pinned = false,
): Conversation => ({ id, title: id, messages: [], lastActive, pinned });

describe("session list reconciliation", () => {
  it("sorts pinned and unpinned groups by recent activity", () => {
    expect(
      sortSessions([
        session("recent", 40),
        session("old-pin", 10, true),
        session("new-pin", 30, true),
        session("old", 20),
      ]).map((item) => item.id),
    ).toEqual(["new-pin", "old-pin", "recent", "old"]);
  });

  it("deduplicates backfilled pinned sessions and retains loaded messages", () => {
    const previous = [
      {
        ...session("pinned", 10, true),
        messages: [{ id: "m", role: "user" as const, content: "hi" }],
      },
    ];
    const merged = mergeSessions(previous, [
      session("recent", 30),
      session("pinned", 20, true),
    ]);
    expect(merged.map((item) => item.id)).toEqual(["pinned", "recent"]);
    expect(merged[0].messages).toHaveLength(1);
  });
});
