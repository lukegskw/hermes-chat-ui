import { describe, expect, it } from "vitest";
import { normalizeSessionMessages } from "./api";

describe("session message normalization", () => {
  it("reconstructs one assistant turn from tool-call, tool-result, and final rows", () => {
    const messages = normalizeSessionMessages("session-1", [
      {
        id: 1,
        role: "user",
        content: "Use three tools",
        timestamp: 1,
      },
      {
        id: 2,
        role: "assistant",
        content: "",
        reasoning_content: "Planning tools",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "terminal", arguments: "{}" },
          },
          {
            id: "call-2",
            type: "function",
            function: { name: "search_files", arguments: "{}" },
          },
        ],
        timestamp: 2,
      },
      {
        id: 3,
        role: "tool",
        content: '{"output":"ok"}',
        timestamp: 3,
      },
      {
        id: 4,
        role: "tool",
        content: '{"files":[]}',
        timestamp: 4,
      },
      {
        id: 5,
        role: "assistant",
        content: "Finished using two tools.",
        timestamp: 5,
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      id: "session-1_2",
      role: "assistant",
      content: "Finished using two tools.",
      reasoning_content: "Planning tools",
      timestamp: new Date(5000).toISOString(),
    });
    expect(messages[1].tool_calls).toHaveLength(2);
  });

  it("keeps ordinary assistant messages separate", () => {
    const messages = normalizeSessionMessages("session-1", [
      { id: 1, role: "user", content: "Hello" },
      { id: 2, role: "assistant", content: "Hi" },
      { id: 3, role: "user", content: "Again" },
      { id: 4, role: "assistant", content: "Hello again" },
    ]);

    expect(messages.map((message) => message.content)).toEqual([
      "Hello",
      "Hi",
      "Again",
      "Hello again",
    ]);
  });
});
