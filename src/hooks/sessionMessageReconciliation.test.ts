import { describe, expect, it } from "vitest";
import { ChatMessage } from "../types";
import { reconcileSessionMessages } from "./sessionMessageReconciliation";

const message = (
  id: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  role: "assistant",
  content: "",
  ...overrides,
});

describe("reconcileSessionMessages", () => {
  it("preserves the complete local history during generation", () => {
    const local = [
      message("user", { role: "user", content: "Run a tool" }),
      message("assistant", {
        content: "Partial response",
        reasoning_content: "Partial reasoning",
        isGenerating: true,
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: { name: "search", arguments: '{"query":"Hermes"}' },
            status: "running",
          },
        ],
      }),
    ];
    const incoming = [message("canonical-user", { role: "user" })];

    expect(reconcileSessionMessages(local, incoming)).toBe(local);
  });

  it("accepts canonical history after generation finishes", () => {
    const local = [message("assistant", { content: "Complete" })];
    const incoming = [message("canonical-assistant", { content: "Complete" })];

    expect(reconcileSessionMessages(local, incoming)).toBe(incoming);
  });

  it("accepts an empty canonical history when nothing is generating", () => {
    expect(reconcileSessionMessages([message("local")], [])).toEqual([]);
  });

  it("accepts canonical messages when local history is empty", () => {
    const incoming = [message("canonical")];

    expect(reconcileSessionMessages([], incoming)).toBe(incoming);
  });
});
