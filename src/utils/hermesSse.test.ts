import { describe, expect, it } from "vitest";
import { HermesSseParser, normalizeHermesEvent } from "./hermesSse";

describe("Hermes SSE normalization", () => {
  it("parses CRLF frames split between arbitrary chunks", () => {
    const parser = new HermesSseParser();

    expect(parser.push("event: tool.progress\r")).toEqual([]);
    const events = parser.push(
      '\ndata: {"tool_name":"_thinking","delta":"Live plan"}\r\n\r\n',
    );

    expect(events).toHaveLength(1);
    expect(normalizeHermesEvent(events[0])).toEqual({
      kind: "reasoning_delta",
      text: "Live plan",
    });
  });

  it("processes an unterminated final frame at EOF", () => {
    const parser = new HermesSseParser();
    const events = parser.push(
      'event: assistant.delta\ndata: {"delta":"Final text"}',
      true,
    );

    expect(normalizeHermesEvent(events[0])).toEqual({
      kind: "assistant_delta",
      text: "Final text",
    });
  });

  it("accepts both reasoning transports and tool identifier spellings", () => {
    expect(
      normalizeHermesEvent({
        event: "reasoning.available",
        payload: { text: "Run reasoning" },
      }),
    ).toEqual({ kind: "reasoning_delta", text: "Run reasoning" });

    expect(
      normalizeHermesEvent({
        event: "tool.started",
        payload: { tool_name: "terminal", args: { command: "pwd" } },
      }),
    ).toMatchObject({ kind: "tool", name: "terminal" });
    expect(
      normalizeHermesEvent({
        event: "tool.completed",
        payload: { tool: "browser" },
      }),
    ).toMatchObject({ kind: "tool", name: "browser" });
  });

  it("returns terminal reasoning as an authoritative snapshot", () => {
    expect(
      normalizeHermesEvent({
        event: "run.completed",
        payload: {
          messages: [
            { role: "assistant", reasoning_content: "Canonical reasoning" },
          ],
        },
      }),
    ).toEqual({
      kind: "reasoning_snapshot",
      text: "Canonical reasoning",
    });
  });

  it("accepts reconciled reasoning snapshots emitted by the BFF", () => {
    expect(
      normalizeHermesEvent({
        event: "reasoning.snapshot",
        payload: { session_id: "session-1", text: "Persisted so far" },
      }),
    ).toEqual({
      kind: "reasoning_snapshot",
      text: "Persisted so far",
    });
  });
});
