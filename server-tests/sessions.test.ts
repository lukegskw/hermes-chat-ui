import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractCompletedContent,
  fetchMessageRows,
  reasoningAfterBoundary,
  sessionPath,
} from "../server/sessions.js";
import { testConfig } from "./helpers.js";

afterEach(() => vi.unstubAllGlobals());

describe("Hermes session streaming helpers", () => {
  it("limits reasoning snapshots to the current turn", () => {
    const messages = [
      { role: "assistant", reasoning_content: "old reasoning" },
      { role: "user", content: "new question" },
      { role: "assistant", reasoning_content: "first block" },
      { role: "tool", content: "result" },
      { role: "assistant", reasoning: "second block" },
    ];
    expect(reasoningAfterBoundary(messages, 1)).toBe(
      "first block\n\nsecond block",
    );
  });

  it("extracts a completed assistant event across an incomplete tail", () => {
    const parsed = extractCompletedContent(
      'event: assistant.completed\r\ndata: {"content":"Done"}\r\n\r\nevent: assistant.delta\n',
    );
    expect(parsed.completed).toBe("Done");
    expect(parsed.remainder).toBe("event: assistant.delta\n");
  });

  it("fails supplementary reconciliation closed", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        Response.json({ detail: "unavailable" }, { status: 503 }),
      );
    expect(
      await fetchMessageRows(testConfig(), "session-1", fetcher),
    ).toBeUndefined();
  });

  it("encodes session identifiers as a single path segment", () => {
    expect(sessionPath("one/two", "/messages")).toBe(
      "/api/sessions/one%2Ftwo/messages",
    );
  });
});
