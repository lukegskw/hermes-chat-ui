import { describe, expect, it } from "vitest";
import type { SessionMessageRow } from "../types";
import {
  buildHistoryWindow,
  hasMoreRawHistory,
  prependHistoryRows,
} from "./conversationHistory";

describe("paginated visual history", () => {
  it("renders exactly the latest requested visual messages", () => {
    const rows: SessionMessageRow[] = Array.from(
      { length: 45 },
      (_, index) => ({
        id: index + 1,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `message-${index + 1}`,
      }),
    );
    const window = buildHistoryWindow("session", rows, 30);
    expect(window.messages).toHaveLength(30);
    expect(window.messages[0].content).toBe("message-16");
  });

  it("renormalizes a multi-row tool turn after an older page is prepended", () => {
    const newest: SessionMessageRow[] = [
      { id: 3, role: "tool", content: "result" },
      { id: 4, role: "assistant", content: "final" },
    ];
    const older: SessionMessageRow[] = [
      { id: 1, role: "user", content: "question" },
      {
        id: 2,
        role: "assistant",
        content: "",
        reasoning_content: "planning",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "terminal", arguments: "{}" },
          },
        ],
      },
    ];
    const rows = prependHistoryRows(newest, older);
    const window = buildHistoryWindow("session", rows, 30);
    expect(window.messages).toHaveLength(2);
    expect(window.messages[1]).toMatchObject({
      content: "final",
      reasoning_content: "planning",
    });
    expect(window.messages[1].tool_calls).toHaveLength(1);
  });

  it("deduplicates overlapping row IDs and detects exhausted history", () => {
    expect(
      prependHistoryRows(
        [{ id: 2, role: "assistant", content: "new" }],
        [
          { id: 1, role: "user", content: "old" },
          { id: 2, role: "assistant", content: "duplicate" },
        ],
      ).map((row) => row.id),
    ).toEqual([1, 2]);
    expect(hasMoreRawHistory(30, 30, 30, 30)).toBe(false);
    expect(hasMoreRawHistory(30, 30, 30, 31)).toBe(true);
  });
});
