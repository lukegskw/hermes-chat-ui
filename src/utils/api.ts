/** Hermes Sessions API client. */
import { z } from "zod";
import { logger } from "./logger";
import { HermesSseParser, normalizeHermesEvent } from "./hermesSse";
import {
  ChatMessage,
  ContentPart,
  ConversationAPI,
  ConversationsPage,
  ConversationMessagesPage,
  ModelProvider,
  NewConversationModelSelection,
  SendChatMessageStreamOptions,
  SessionMessageRow,
  ToolCall,
} from "../types";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export const ModelSchema = z.object({
  id: z.string(),
  object: z.string().nullish(),
  created: z.number().nullish(),
  owned_by: z.string().nullish(),
  label: z.string().nullish(),
});

const ModelOptionsSchema = z.object({
  model: z.string().optional(),
  provider: z.string().optional(),
  reasoning_efforts: z.array(z.string()).optional(),
  reasoning_unconfirmed_efforts: z.array(z.string()).optional(),
  reasoning_defaults: z
    .record(z.string(), z.record(z.string(), z.string()))
    .optional(),
  providers: z.array(
    z.object({
      slug: z.string(),
      name: z.string().optional(),
      models: z.array(z.string()).optional(),
      capabilities: z
        .record(z.string(), z.object({ reasoning: z.boolean().optional() }))
        .optional(),
    }),
  ),
});

const SessionSchema = z.object({
  id: z.string(),
  source: z.string().nullish(),
  model: z.string().nullish(),
  title: z.string().nullish(),
  started_at: z.number().nullish(),
  last_active: z.number().nullish(),
  message_count: z.number().optional(),
  parent_session_id: z.string().nullish(),
  pinned: z.boolean().optional(),
});

const SessionsResponseSchema = z.object({
  data: z.array(SessionSchema),
  has_more: z.boolean(),
});

const SessionEnvelopeSchema = z.object({
  session: SessionSchema,
});

const SessionMessageSchema = z.object({
  id: z.union([z.number(), z.string()]).optional(),
  role: z.enum(["user", "assistant", "system", "tool"]),
  content: z.unknown().nullish(),
  reasoning: z.string().nullish(),
  reasoning_content: z.string().nullish(),
  tool_calls: z.unknown().nullish(),
  timestamp: z.number().nullish(),
});

const SessionMessagesSchema = z.object({
  session_id: z.string(),
  data: z.array(SessionMessageSchema),
  pagination: z
    .object({
      limit: z.number(),
      offset: z.number(),
      order: z.string(),
      returned: z.number(),
    })
    .optional(),
});

const CapabilitiesSchema = z.object({
  features: z.object({
    session_resources: z.literal(true),
    session_chat: z.literal(true),
    session_chat_streaming: z.literal(true),
    model_options: z.literal(true),
    session_model_lock: z.literal(true),
  }),
  endpoints: z.object({
    sessions: z.object({ path: z.string() }),
    session_create: z.object({ path: z.string() }),
    session_delete: z.object({ path: z.string() }),
    session_messages: z.object({ path: z.string() }),
    session_chat_stream: z.object({ path: z.string() }),
    model_options: z.object({ path: z.string() }),
    session_model_lock: z.object({ path: z.string() }),
  }),
});

const apiBase = (endpoint: string) => endpoint.replace(/\/$/, "");

const parseError = async (response: Response): Promise<ApiError> => {
  let message = response.statusText || `HTTP ${response.status}`;
  let code: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object") {
      const record = body as Record<string, unknown>;
      const error = record.error;
      if (error && typeof error === "object") {
        const errorRecord = error as Record<string, unknown>;
        if (typeof errorRecord.message === "string")
          message = errorRecord.message;
        if (typeof errorRecord.code === "string") code = errorRecord.code;
      }
      if (typeof record.detail === "string") message = record.detail;
      if (typeof record.code === "string") code = record.code;
    }
  } catch {
    // Keep the HTTP status text when the upstream response is not JSON.
  }
  return new ApiError(message, response.status, code);
};

const assertOk = async (response: Response): Promise<Response> => {
  if (!response.ok) throw await parseError(response);
  return response;
};

const toConversation = (
  session: z.infer<typeof SessionSchema>,
): ConversationAPI => ({
  id: session.id,
  title: session.title ?? "",
  modelId: session.model,
  source: session.source,
  lastActive: session.last_active ?? session.started_at,
  messageCount: session.message_count ?? 0,
  pinned: session.pinned ?? false,
  messages: [],
});

const normalizeContent = (content: unknown): string | ContentPart[] => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts = content.flatMap<ContentPart>((part) => {
      if (!part || typeof part !== "object") return [];
      const record = part as Record<string, unknown>;
      if (record.type === "text" && typeof record.text === "string") {
        return [{ type: "text", text: record.text }];
      }
      if (
        record.type === "image_url" &&
        record.image_url &&
        typeof record.image_url === "object"
      ) {
        const url = (record.image_url as Record<string, unknown>).url;
        if (typeof url === "string") {
          return [{ type: "image_url", image_url: { url } }];
        }
      }
      return [];
    });
    if (parts.length > 0) return parts;
  }
  if (content === null || content === undefined) return "";
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
};

const normalizeToolCalls = (toolCalls: unknown): ToolCall[] | undefined => {
  let parsed = toolCalls;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  const normalized = parsed.flatMap<ToolCall>((tool, index) => {
    if (!tool || typeof tool !== "object") return [];
    const record = tool as Record<string, unknown>;
    const fn = record.function;
    const fnRecord =
      fn && typeof fn === "object" ? (fn as Record<string, unknown>) : {};
    return [
      {
        id: typeof record.id === "string" ? record.id : `tool_${index}`,
        type: typeof record.type === "string" ? record.type : "function",
        function: {
          name: typeof fnRecord.name === "string" ? fnRecord.name : "",
          arguments:
            typeof fnRecord.arguments === "string" ? fnRecord.arguments : "",
        },
        status: "completed",
      },
    ];
  });
  return normalized.length > 0 ? normalized : undefined;
};

const toChatMessage = (
  sessionId: string,
  message: SessionMessageRow,
  index: number,
): ChatMessage => ({
  id: `${sessionId}_${message.id ?? index}`,
  role: message.role,
  content: normalizeContent(message.content),
  reasoning_content:
    message.reasoning_content ?? message.reasoning ?? undefined,
  tool_calls: normalizeToolCalls(message.tool_calls),
  timestamp: message.timestamp
    ? new Date(message.timestamp * 1000).toISOString()
    : undefined,
});

const mergeAssistantMessages = (
  pending: ChatMessage,
  next: ChatMessage,
): ChatMessage => {
  const pendingText =
    typeof pending.content === "string" ? pending.content.trim() : "";
  const nextText = typeof next.content === "string" ? next.content.trim() : "";
  const toolCalls = [...(pending.tool_calls ?? []), ...(next.tool_calls ?? [])];
  const uniqueToolCalls = Array.from(
    new Map(toolCalls.map((toolCall) => [toolCall.id, toolCall])).values(),
  );

  return {
    ...pending,
    content: nextText || pendingText,
    reasoning_content:
      [pending.reasoning_content, next.reasoning_content]
        .filter(Boolean)
        .join("\n\n") || undefined,
    tool_calls: uniqueToolCalls.length > 0 ? uniqueToolCalls : undefined,
    timestamp: next.timestamp ?? pending.timestamp,
  };
};

/**
 * Hermes persists one assistant row containing tool calls, one row per tool
 * result, and a final assistant row. The live stream displays that as one
 * assistant turn, so history must reconstruct the same visual unit.
 */
export const normalizeSessionMessages = (
  sessionId: string,
  messages: SessionMessageRow[],
): ChatMessage[] => {
  const normalized: ChatMessage[] = [];
  let pendingAssistant: ChatMessage | null = null;

  const flushPendingAssistant = () => {
    if (!pendingAssistant) return;
    normalized.push(pendingAssistant);
    pendingAssistant = null;
  };

  messages.forEach((message, index) => {
    if (message.role === "tool") return;
    const next = toChatMessage(sessionId, message, index);

    if (message.role !== "assistant") {
      flushPendingAssistant();
      normalized.push(next);
      return;
    }

    const containsToolCalls = Boolean(next.tool_calls?.length);
    if (pendingAssistant) {
      pendingAssistant = mergeAssistantMessages(pendingAssistant, next);
      if (!containsToolCalls && next.content) flushPendingAssistant();
    } else if (containsToolCalls) {
      pendingAssistant = next;
    } else {
      normalized.push(next);
    }
  });

  flushPendingAssistant();
  return normalized;
};

export const fetchModels = async (
  endpoint: string,
): Promise<{
  providers: ModelProvider[];
  defaultModel: string;
  defaultProvider: string;
  reasoningEfforts: string[];
  unconfirmedReasoningEfforts: string[];
  reasoningDefaults: Partial<Record<string, Record<string, string>>>;
}> => {
  const response = await assertOk(
    await fetch(`${apiBase(endpoint)}/api/model/options`),
  );
  const parsed = ModelOptionsSchema.parse(await response.json());
  return {
    providers: parsed.providers.map((provider) => ({
      id: provider.slug,
      label: provider.name || provider.slug,
      models: (provider.models || []).map((id) => ({ id, label: id })),
      capabilities: provider.capabilities,
    })),
    defaultModel: parsed.model || "",
    defaultProvider: parsed.provider || "",
    reasoningEfforts: parsed.reasoning_efforts || [],
    unconfirmedReasoningEfforts: parsed.reasoning_unconfirmed_efforts || [],
    reasoningDefaults: parsed.reasoning_defaults || {},
  };
};

export const assertSessionCapabilities = async (
  endpoint: string,
): Promise<void> => {
  const response = await assertOk(
    await fetch(`${apiBase(endpoint)}/v1/capabilities`),
  );
  const parsed = CapabilitiesSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new ApiError(
      "This Hermes Agent version does not expose the required Sessions API. Update the bundled Hermes image.",
      426,
      "sessions_api_unavailable",
    );
  }
};

export const fetchConversations = async (
  endpoint: string,
  options: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<ConversationsPage> => {
  const params = new URLSearchParams({
    limit: String(options.limit ?? 50),
    offset: String(options.offset ?? 0),
    include_children: "true",
  });
  const response = await assertOk(
    await fetch(`${apiBase(endpoint)}/api/sessions?${params.toString()}`, {
      signal: options.signal,
    }),
  );
  const parsed = SessionsResponseSchema.parse(await response.json());
  return {
    conversations: parsed.data.map(toConversation),
    hasMore: parsed.has_more,
  };
};

export const fetchConversation = async (
  endpoint: string,
  id: string,
  signal?: AbortSignal,
): Promise<ConversationAPI> => {
  const response = await assertOk(
    await fetch(`${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}`, {
      signal,
    }),
  );
  const parsed = SessionEnvelopeSchema.parse(await response.json());
  return toConversation(parsed.session);
};

export const fetchConversationMessages = async (
  endpoint: string,
  id: string,
  signal?: AbortSignal,
): Promise<ChatMessage[]> => {
  const response = await assertOk(
    await fetch(
      `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}/messages`,
      { signal },
    ),
  );
  const parsed = SessionMessagesSchema.parse(await response.json());
  return normalizeSessionMessages(parsed.session_id, parsed.data);
};

export const fetchConversationMessagesPage = async (
  endpoint: string,
  id: string,
  options: {
    limit: number;
    offset: number;
    signal?: AbortSignal;
  },
): Promise<ConversationMessagesPage> => {
  const params = new URLSearchParams({
    limit: String(options.limit),
    offset: String(options.offset),
    order: "latest",
  });
  const response = await assertOk(
    await fetch(
      `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}/messages?${params.toString()}`,
      { signal: options.signal },
    ),
  );
  const parsed = SessionMessagesSchema.parse(await response.json());
  return {
    sessionId: parsed.session_id,
    rows: parsed.data,
    returned: parsed.pagination?.returned ?? parsed.data.length,
  };
};

export const createConversation = async (
  endpoint: string,
  options: {
    selection?: NewConversationModelSelection;
    source?: string;
  } = {},
): Promise<ConversationAPI> => {
  const selection = options.selection;
  const response = await assertOk(
    await fetch(`${apiBase(endpoint)}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: options.source ?? "hermes_browser",
        ...(selection
          ? {
              model: selection.modelId,
              provider: selection.providerId,
              require_model_lock: true,
            }
          : {}),
      }),
    }),
  );
  const parsed = SessionEnvelopeSchema.parse(await response.json());
  const conversation = toConversation(parsed.session);
  // The public Hermes session representation excludes model_config/provider.
  // Retain the exact lock acknowledged by the create request in client state.
  return selection
    ? {
        ...conversation,
        modelId: selection.modelId,
        providerId: selection.providerId,
      }
    : conversation;
};

export const deleteConversation = async (
  endpoint: string,
  id: string,
): Promise<void> => {
  await assertOk(
    await fetch(`${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
};

export const updateConversationTitle = async (
  endpoint: string,
  id: string,
  title: string,
): Promise<void> => {
  await assertOk(
    await fetch(`${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    }),
  );
};

export const updateConversationPinned = async (
  endpoint: string,
  id: string,
  pinned: boolean,
): Promise<void> => {
  await assertOk(
    await fetch(`${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned }),
    }),
  );
};

export const updateConversationModel = async (
  endpoint: string,
  id: string,
  selection: { modelId: string; providerId?: string; reasoningEffort?: string },
): Promise<void> => {
  await assertOk(
    await fetch(
      `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}/model`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selection.modelId,
          ...(selection.providerId ? { provider: selection.providerId } : {}),
          model_options: selection.reasoningEffort
            ? {
                reasoning: { enabled: true, effort: selection.reasoningEffort },
              }
            : {},
          require_model_lock: true,
        }),
      },
    ),
  );
};

const streamChatMessage = async (
  {
    endpoint,
    message,
    instructions,
    conversationId,
    onChunk,
    onReasoningChunk,
    onReasoningSnapshot,
    onToolCallChunk,
    onGenerationSnapshot,
    onDone,
    onError,
    signal,
  }: SendChatMessageStreamOptions,
  method: "POST" | "GET",
): Promise<boolean> => {
  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onDone();
  };
  const activeTools: Array<{
    id: string;
    name: string;
    index: number;
    status: "running" | "completed" | "error";
  }> = [];
  try {
    const rawResponse = await fetch(
      `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(conversationId)}/chat/stream`,
      {
        method,
        headers:
          method === "POST"
            ? {
                "Content-Type": "application/json",
                Accept: "text/event-stream",
              }
            : { Accept: "text/event-stream" },
        body:
          method === "POST"
            ? JSON.stringify({
                message,
                ...(instructions ? { instructions } : {}),
              })
            : undefined,
        signal,
      },
    );
    if (method === "GET" && rawResponse.status === 204) return false;
    const response = await assertOk(rawResponse);
    if (!response.body)
      throw new Error("Hermes returned an empty event stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new HermesSseParser();

    const handleEvent = (
      parsed: ReturnType<HermesSseParser["push"]>[number],
    ): boolean => {
      const normalized = normalizeHermesEvent(parsed);
      if (normalized.kind === "generation_snapshot") {
        activeTools.splice(
          0,
          activeTools.length,
          ...normalized.snapshot.toolCalls.map((tool, index) => ({
            id: tool.id,
            name: tool.function.name,
            index,
            status: tool.status ?? "running",
          })),
        );
        onGenerationSnapshot?.(normalized.snapshot);
      } else if (normalized.kind === "assistant_delta") {
        onChunk(normalized.text);
      } else if (normalized.kind === "reasoning_delta") {
        onReasoningChunk?.(normalized.text);
      } else if (normalized.kind === "reasoning_snapshot") {
        if (onReasoningSnapshot) onReasoningSnapshot(normalized.text);
        else onReasoningChunk?.(normalized.text);
      } else if (normalized.kind === "tool") {
        let tool = normalized.id
          ? activeTools.find((entry) => entry.id === normalized.id)
          : [...activeTools]
              .reverse()
              .find(
                (entry) =>
                  entry.name === normalized.name && entry.status === "running",
              );
        if (normalized.event === "tool.started" || !tool) {
          tool = {
            id:
              normalized.id ??
              `${String(parsed.payload.message_id ?? "message")}_${activeTools.length}`,
            name: normalized.name,
            index: activeTools.length,
            status: "running",
          };
          activeTools.push(tool);
        }
        tool.status =
          normalized.event === "tool.started"
            ? "running"
            : normalized.event === "tool.failed"
              ? "error"
              : "completed";
        onToolCallChunk?.({
          index: tool.index,
          id: tool.id,
          type: "function",
          function: {
            name: normalized.name,
            arguments: normalized.args ? JSON.stringify(normalized.args) : "",
          },
          label: normalized.preview ?? normalized.name,
          status: tool.status,
        });
      } else if (normalized.kind === "error") {
        throw new Error(normalized.message);
      } else if (normalized.kind === "done") {
        finish();
        return true;
      }
      return false;
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const parsed of parser.push(
        decoder.decode(value, { stream: true }),
      )) {
        if (handleEvent(parsed)) return true;
      }
    }
    for (const parsed of parser.push(decoder.decode(), true)) {
      if (handleEvent(parsed)) return true;
    }
    finish();
    return true;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      if (method === "POST") finish();
    } else if (
      method === "POST" &&
      typeof document !== "undefined" &&
      document.visibilityState === "hidden"
    ) {
      finish();
    } else {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      logger.error({ error: normalized }, "Streaming connection error");
      onError(normalized);
      if (method === "GET") throw normalized;
    }
    return method === "POST";
  }
};

export const sendChatMessageStream = async (
  options: SendChatMessageStreamOptions,
): Promise<void> => {
  await streamChatMessage(options, "POST");
};

export const resumeChatMessageStream = (
  options: SendChatMessageStreamOptions,
): Promise<boolean> => streamChatMessage(options, "GET");

export const cancelSessionChat = async (
  endpoint: string,
  sessionId: string,
): Promise<void> => {
  await assertOk(
    await fetch(
      `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(sessionId)}/chat/cancel`,
      { method: "POST" },
    ),
  );
};
