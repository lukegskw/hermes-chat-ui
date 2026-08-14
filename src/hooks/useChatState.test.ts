import { describe, expect, it } from "vitest";
import type { Conversation } from "../types";
import { mergeSessions } from "./sessionListReconciliation";

const conversation = (
  overrides: Partial<Conversation> & Pick<Conversation, "id">,
): Conversation => ({
  title: "",
  messages: [],
  ...overrides,
});

describe("session reconciliation", () => {
  it("preserves a confirmed provider/model pair omitted by Hermes", () => {
    const merged = mergeSessions(
      [
        conversation({
          id: "session-1",
          providerId: "openai-codex",
          modelId: "gpt-5.6-sol",
          reasoningEffort: "high",
        }),
      ],
      [conversation({ id: "session-1", modelId: "gpt-5.6-sol" })],
    );

    expect(merged[0]).toMatchObject({
      providerId: "openai-codex",
      modelId: "gpt-5.6-sol",
      reasoningEffort: "high",
    });
  });

  it("does not combine an incoming model with an existing provider", () => {
    const merged = mergeSessions(
      [
        conversation({
          id: "session-1",
          providerId: "openai-codex",
          modelId: "gpt-5.6-sol",
        }),
      ],
      [conversation({ id: "session-1", modelId: "deepseek-v4-pro" })],
    );

    expect(merged[0]).toMatchObject({
      providerId: "openai-codex",
      modelId: "gpt-5.6-sol",
    });
  });
});
