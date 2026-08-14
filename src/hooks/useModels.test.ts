import { describe, expect, it } from "vitest";
import {
  resolveActiveModelId,
  resolveActiveProviderId,
  resolveNewConversationSelection,
} from "./useModels";

describe("model selection resolution", () => {
  const hermesDefault = {
    providerId: "opencode-go",
    modelId: "deepseek-v4-pro",
  };

  it.each(["default", "hermes-agent"])(
    "resolves the Hermes virtual model %s to the concrete global model",
    (virtualModel) => {
      expect(
        resolveActiveModelId(virtualModel, undefined, hermesDefault.modelId),
      ).toBe("deepseek-v4-pro");
    },
  );

  it("keeps an explicitly stored model even when its ID is default", () => {
    expect(
      resolveActiveModelId("default", "default", hermesDefault.modelId),
    ).toBe("default");
  });

  it("returns the concrete Hermes default for new conversations", () => {
    expect(resolveNewConversationSelection(true, hermesDefault, null)).toEqual(
      hermesDefault,
    );
  });

  it("does not guess a provider when multiple providers expose the model", () => {
    const providers = [
      {
        id: "opencode-go",
        label: "OpenCode Go",
        models: [{ id: "gpt-5.6-sol" }],
      },
      {
        id: "openai-codex",
        label: "OpenAI Codex",
        models: [{ id: "gpt-5.6-sol" }],
      },
    ];

    expect(
      resolveActiveProviderId(
        providers,
        "gpt-5.6-sol",
        undefined,
        hermesDefault,
      ),
    ).toBe("");
    expect(
      resolveActiveProviderId(
        providers,
        "gpt-5.6-sol",
        "openai-codex",
        hermesDefault,
      ),
    ).toBe("openai-codex");
  });
});
