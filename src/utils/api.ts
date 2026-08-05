/** Hermes Sessions API client. */
import { z } from "zod";
import { logger } from "./logger";
import {
  ChatMessage,
  ContentPart,
  ConversationAPI,
  ConversationsPage,
  Model,
  SendChatMessageStreamOptions,
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

const ModelsResponseSchema = z.object({
  data: z.array(ModelSchema).optional(),
  default_model: z.string().optional(),
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
});

const CapabilitiesSchema = z.object({
  features: z.object({
    session_resources: z.literal(true),
    session_chat: z.literal(true),
    session_chat_streaming: z.literal(true),
  }),
  endpoints: z.object({
    sessions: z.object({ path: z.string() }),
    session_create: z.object({ path: z.string() }),
    session_delete: z.object({ path: z.string() }),
    session_messages: z.object({ path: z.string() }),
    session_chat_stream: z.object({ path: z.string() }),
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

type SessionMessage = z.infer<typeof SessionMessageSchema>;

const toChatMessage = (
  sessionId: string,
  message: SessionMessage,
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
  messages: SessionMessage[],
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
): Promise<{ models: Model[]; defaultModel: string }> => {
  const response = await assertOk(
    await fetch(`${apiBase(endpoint)}/api/models`),
  );
  const parsed = ModelsResponseSchema.parse(await response.json());
  return {
    models: parsed.data ?? [],
    defaultModel: parsed.default_model || parsed.data?.[0]?.id || "",
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

export const createConversation = async (
  endpoint: string,
  options: { modelId?: string; source?: string } = {},
): Promise<ConversationAPI> => {
  const response = await assertOk(
    await fetch(`${apiBase(endpoint)}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: options.source ?? "hermes_browser",
        ...(options.modelId ? { model: options.modelId } : {}),
      }),
    }),
  );
  const parsed = SessionEnvelopeSchema.parse(await response.json());
  return toConversation(parsed.session);
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

export const updateConversationModel = async (
  endpoint: string,
  id: string,
  modelId: string,
): Promise<void> => {
  await assertOk(
    await fetch(
      `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}/model`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelId }),
      },
    ),
  );
};

type SsePayload = Record<string, unknown>;

const parseSseBlock = (
  block: string,
): { event: string; payload: SsePayload } | null => {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (data.length === 0) return null;
  try {
    const payload: unknown = JSON.parse(data.join("\n"));
    return payload && typeof payload === "object"
      ? { event, payload: payload as SsePayload }
      : null;
  } catch {
    return null;
  }
};

export const sendChatMessageStream = async ({
  endpoint,
  model,
  message,
  instructions,
  conversationId,
  onChunk,
  onReasoningChunk,
  onToolCallChunk,
  onDone,
  onError,
  signal,
}: SendChatMessageStreamOptions): Promise<void> => {
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
    const response = await assertOk(
      await fetch(
        `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(conversationId)}/chat/stream`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
          },
          body: JSON.stringify({
            message,
            ...(model ? { model } : {}),
            ...(instructions ? { instructions } : {}),
          }),
          signal,
        },
      ),
    );
    if (!response.body) throw new Error("Hermes returned an empty stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        const parsed = parseSseBlock(block);
        if (!parsed) continue;
        const { event, payload } = parsed;

        if (event === "assistant.delta" && typeof payload.delta === "string") {
          onChunk(payload.delta);
        } else if (
          event === "run.completed" &&
          Array.isArray(payload.messages)
        ) {
          const reasoningParts = payload.messages
            .filter(
              (msg: unknown) =>
                msg && (msg as Record<string, unknown>).role === "assistant",
            )
            .map(
              (msg: unknown) =>
                (msg as Record<string, unknown>).reasoning_content ||
                (msg as Record<string, unknown>).reasoning,
            )
            .filter(Boolean);
          if (reasoningParts.length > 0) {
            onReasoningChunk?.(reasoningParts.join("\n\n"));
          }
        } else if (
          ["tool.started", "tool.completed", "tool.failed"].includes(event)
        ) {
          const name =
            typeof payload.tool_name === "string" ? payload.tool_name : "tool";
          let tool = [...activeTools]
            .reverse()
            .find((entry) => entry.name === name && entry.status === "running");
          if (event === "tool.started" || !tool) {
            tool = {
              id: `${String(payload.message_id ?? "message")}_${activeTools.length}`,
              name,
              index: activeTools.length,
              status: "running",
            };
            activeTools.push(tool);
          }
          tool.status =
            event === "tool.started"
              ? "running"
              : event === "tool.failed"
                ? "error"
                : "completed";
          onToolCallChunk?.({
            index: tool.index,
            id: tool.id,
            type: "function",
            function: {
              name,
              arguments: payload.args ? JSON.stringify(payload.args) : "",
            },
            label: typeof payload.preview === "string" ? payload.preview : name,
            status: tool.status,
          });
        } else if (event === "error") {
          throw new Error(
            typeof payload.message === "string"
              ? payload.message
              : "Hermes stream failed",
          );
        } else if (event === "done") {
          finish();
          return;
        }
      }
    }
    finish();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      finish();
    } else if (document.visibilityState === "hidden") {
      finish();
    } else {
      const normalized =
        error instanceof Error ? error : new Error(String(error));
      logger.error({ error: normalized }, "Streaming connection error");
      onError(normalized);
    }
  }
};

export const cancelSessionChat = async (
  endpoint: string,
  id: string,
): Promise<void> => {
  await assertOk(
    await fetch(
      `${apiBase(endpoint)}/api/sessions/${encodeURIComponent(id)}/chat/cancel`,
      { method: "POST" },
    ),
  );
};
