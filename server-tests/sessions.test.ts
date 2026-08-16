import { afterEach, describe, expect, it, vi } from "vitest";
import {
  cancelActiveStream,
  extractCompletedContent,
  fetchMessageRows,
  reasoningAfterBoundary,
  resumeActiveStream,
  sessionPath,
  streamSessionChat,
} from "../server/sessions.js";
import { testConfig } from "./helpers.js";

afterEach(async () => {
  await cancelActiveStream("session-resume");
  vi.unstubAllGlobals();
});

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

  it("replays a snapshot and continues live streaming after reconnect", async () => {
    let upstreamController!: ReadableStreamDefaultController<Uint8Array>;
    const upstreamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        upstreamController = controller;
      },
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({ detail: "history unavailable" }, { status: 503 }),
        )
        .mockResolvedValueOnce(new Response(upstreamBody, { status: 200 })),
    );

    const first = await streamSessionChat(
      testConfig(),
      "session-resume",
      new Request("http://ui.test/api/sessions/session-resume/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: "Hello" }),
      }),
    );
    const firstReader = first.body!.getReader();
    expect(
      new TextDecoder().decode((await firstReader.read()).value),
    ).toContain("event: generation.snapshot");
    await firstReader.cancel();

    upstreamController.enqueue(
      new TextEncoder().encode(
        'event: assistant.delta\ndata: {"delta":"First"}\n\n',
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const resumed = resumeActiveStream("session-resume");
    expect(resumed.status).toBe(200);
    const resumedReader = resumed.body!.getReader();
    const snapshot = new TextDecoder().decode(
      (await resumedReader.read()).value,
    );
    expect(snapshot).toContain('"content":"First"');

    upstreamController.enqueue(
      new TextEncoder().encode(
        'event: assistant.delta\ndata: {"delta":" second"}\n\n' +
          "event: done\ndata: {}\n\n",
      ),
    );
    upstreamController.close();

    let tail = "";
    for (;;) {
      const chunk = await resumedReader.read();
      if (chunk.done) break;
      tail += new TextDecoder().decode(chunk.value);
    }
    expect(tail).toContain('"delta":" second"');
    expect(tail).toContain("event: done");
    expect(resumeActiveStream("session-resume").status).toBe(204);
  });
});
