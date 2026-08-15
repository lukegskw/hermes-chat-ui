import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createConversation,
  fetchConversations,
  fetchModels,
  normalizeSessionMessages,
  sendChatMessageStream,
  updateConversationModel,
  updateConversationPinned,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("session stream parsing", () => {
  it("emits Hermes thinking progress before the final response", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            [
              "event: reasoning.available",
              'data: {"text":"Planning the answer."}',
              "",
              "event: message.delta",
              'data: {"delta":"The answer."}',
              "",
              "event: done",
              "data: {}",
              "",
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }),
      ),
    );

    const reasoning: string[] = [];
    const response: string[] = [];
    const done = vi.fn();

    await sendChatMessageStream({
      endpoint: "http://hermes.test",
      conversationId: "session-1",
      message: "Hello",
      onChunk: (chunk) => response.push(chunk),
      onReasoningChunk: (chunk) => reasoning.push(chunk),
      onDone: done,
      onError: (error) => {
        throw error;
      },
    });

    expect(reasoning).toEqual(["Planning the answer."]);
    expect(response).toEqual(["The answer."]);
    expect(done).toHaveBeenCalledOnce();
  });

  it("streams Sessions API thinking and tool_name events before completion", async () => {
    const chunks = [
      "event: tool.progress\r",
      '\ndata: {"tool_name":"_thinking","delta":"Inspecting"}\r\n\r\n' +
        'event: tool.started\r\ndata: {"tool_name":"terminal","args":{"command":"pwd"}}\r\n\r\n',
      'event: tool.completed\ndata: {"tool_name":"terminal"}\n\n' +
        'event: assistant.delta\ndata: {"delta":"Done"}',
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 })),
    );
    const reasoning: string[] = [];
    const response: string[] = [];
    const tools: unknown[] = [];

    await sendChatMessageStream({
      endpoint: "http://hermes.test",
      conversationId: "session-1",
      message: "Hello",
      onChunk: (chunk) => response.push(chunk),
      onReasoningChunk: (chunk) => reasoning.push(chunk),
      onToolCallChunk: (tool) => tools.push(tool),
      onDone: vi.fn(),
      onError: (error) => {
        throw error;
      },
    });

    expect(reasoning).toEqual(["Inspecting"]);
    expect(response).toEqual(["Done"]);
    expect(tools).toMatchObject([
      { function: { name: "terminal" }, status: "running" },
      { function: { name: "terminal" }, status: "completed" },
    ]);
  });

  it("replaces streamed reasoning with the terminal canonical snapshot", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            [
              "event: reasoning.available",
              'data: {"text":"Partial"}',
              "",
              "event: run.completed",
              'data: {"messages":[{"role":"assistant","reasoning_content":"Canonical"}]}',
              "",
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 })),
    );
    const deltas: string[] = [];
    const snapshots: string[] = [];

    await sendChatMessageStream({
      endpoint: "http://hermes.test",
      conversationId: "session-1",
      message: "Hello",
      onChunk: vi.fn(),
      onReasoningChunk: (chunk) => deltas.push(chunk),
      onReasoningSnapshot: (content) => snapshots.push(content),
      onDone: vi.fn(),
      onError: (error) => {
        throw error;
      },
    });

    expect(deltas).toEqual(["Partial"]);
    expect(snapshots).toEqual(["Canonical"]);
  });

  it("replaces reasoning as reconciled snapshots arrive during the run", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            [
              "event: reasoning.snapshot",
              'data: {"session_id":"session-1","text":"First persisted block"}',
              "",
              "event: reasoning.snapshot",
              'data: {"session_id":"session-1","text":"First persisted block plus more"}',
              "",
            ].join("\n"),
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(stream, { status: 200 })),
    );
    const snapshots: string[] = [];

    await sendChatMessageStream({
      endpoint: "http://hermes.test",
      conversationId: "session-1",
      message: "Hello",
      onChunk: vi.fn(),
      onReasoningSnapshot: (content) => snapshots.push(content),
      onDone: vi.fn(),
      onError: (error) => {
        throw error;
      },
    });

    expect(snapshots).toEqual([
      "First persisted block",
      "First persisted block plus more",
    ]);
  });
});

describe("model catalog", () => {
  it("uses reasoning efforts returned by the BFF catalog", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            model: "global-model",
            provider: "openai",
            reasoning_efforts: ["minimal", "medium", "xhigh"],
            reasoning_unconfirmed_efforts: ["xhigh"],
            reasoning_defaults: { openai: { "global-model": "high" } },
            providers: [
              {
                slug: "openai",
                name: "OpenAI",
                models: ["global-model"],
                capabilities: { "global-model": { reasoning: true } },
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(fetchModels("http://hermes.test")).resolves.toMatchObject({
      defaultModel: "global-model",
      defaultProvider: "openai",
      reasoningEfforts: ["minimal", "medium", "xhigh"],
      unconfirmedReasoningEfforts: ["xhigh"],
      reasoningDefaults: { openai: { "global-model": "high" } },
    });
  });

  it("creates a selected new conversation with an atomic Hermes model lock", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session: { id: "session-1", title: "", model: "chosen-model" },
        }),
        { status: 201 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const conversation = await createConversation("http://hermes.test", {
      selection: { providerId: "openai", modelId: "chosen-model" },
    });

    expect(conversation).toMatchObject({
      providerId: "openai",
      modelId: "chosen-model",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://hermes.test/api/sessions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          source: "hermes_browser",
          model: "chosen-model",
          provider: "openai",
          require_model_lock: true,
        }),
      }),
    );
  });

  it("keeps runtime fields out of ordinary stream turns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("event: done\ndata: {}\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendChatMessageStream({
      endpoint: "http://hermes.test",
      conversationId: "session-1",
      message: "Hello",
      instructions: "Be concise",
      onChunk: vi.fn(),
      onDone: vi.fn(),
      onError: (error) => {
        throw error;
      },
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      message: "Hello",
      instructions: "Be concise",
    });
  });

  it("persists provider, model, and reasoning only on an explicit change", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    await updateConversationModel("http://hermes.test", "session-1", {
      modelId: "gpt-5.6-sol",
      providerId: "openai-codex",
      reasoningEffort: "high",
    });

    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(request.body as string)).toEqual({
      model: "gpt-5.6-sol",
      provider: "openai-codex",
      model_options: {
        reasoning: { enabled: true, effort: "high" },
      },
      require_model_lock: true,
    });
  });
});

describe("pinned sessions", () => {
  it("reads native Hermes pin state and patches it without a local store", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          data: [
            {
              id: "session-1",
              title: "Pinned",
              pinned: true,
              message_count: 0,
            },
          ],
          has_more: false,
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);

    const page = await fetchConversations("http://hermes.test");
    expect(page.conversations[0].pinned).toBe(true);
    await updateConversationPinned("http://hermes.test", "session-1", false);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: "PATCH",
      body: JSON.stringify({ pinned: false }),
    });
  });
});
