import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KNOWN_REASONING_EFFORTS,
  effectiveReasoningDefault,
  modelOptionsResponse,
} from "../server/model-options.js";
import { testConfig } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("reasoning model options", () => {
  it("matches global defaults and spelling-tolerant overrides", () => {
    const config = {
      agent: {
        reasoning_effort: "medium",
        reasoning_overrides: {
          "claude-opus-4.5": "ultra",
          "disabled-model": false,
        },
      },
    };
    expect(effectiveReasoningDefault(config, "claude-opus-4-5")).toBe("ultra");
    expect(effectiveReasoningDefault(config, "disabled-model")).toBe("none");
    expect(effectiveReasoningDefault(config, "other-model")).toBe("medium");
  });

  it("adds all known efforts and marks unadvertised values", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "hermes-config-"));
    const configPath = path.join(directory, "config.yaml");
    await writeFile(
      configPath,
      "agent:\n  reasoning_effort: high\n  reasoning_overrides:\n    model-b: false\n",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          model: "model-a",
          provider: "openai",
          reasoning_efforts: ["none", "high", "future-level"],
          providers: [{ slug: "openai", models: ["model-a", "model-b"] }],
        }),
      ),
    );
    const response = await modelOptionsResponse(
      testConfig({ hermesConfigPath: configPath }),
    );
    const body = await response.json();
    expect(body.reasoning_efforts).toEqual(KNOWN_REASONING_EFFORTS);
    expect(body.reasoning_unconfirmed_efforts).toEqual([
      "minimal",
      "low",
      "medium",
      "xhigh",
      "max",
      "ultra",
    ]);
    expect(body.reasoning_defaults).toEqual({
      openai: { "model-a": "high", "model-b": "none" },
    });
  });

  it("uses max and ultra as the conservative fallback", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ model: "model-a", provider: "p", providers: [] }),
        ),
    );
    const response = await modelOptionsResponse(testConfig());
    const body = await response.json();
    expect(body.reasoning_unconfirmed_efforts).toEqual(["max", "ultra"]);
  });
});
