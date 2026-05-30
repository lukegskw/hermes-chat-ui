/**
 * Hermes OpenAI-Compatible Client API in TypeScript
 */
import { z } from "zod";
import { logger } from "./logger";

export const ModelSchema = z.object({
  id: z.string(),
  object: z.string().optional(),
  created: z.number().optional(),
  owned_by: z.string().optional(),
  label: z.string().optional(),
});

export type Model = z.infer<typeof ModelSchema>;

const ModelsResponseSchema = z.object({
  data: z.array(ModelSchema).optional(),
  default_model: z.string().optional(),
});

export interface ToolCall {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
  status?: "running" | "completed" | "error";
}

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  isGenerating?: boolean;
  timestamp?: string;
}

export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  modelId: z.string().optional(),
  messages: z.array(z.custom<ChatMessage>()),
  updated_at: z.string().optional(),
});

export type ConversationAPI = z.infer<typeof ConversationSchema>;

export interface SendChatMessageStreamOptions {
  endpoint: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  conversationId?: string;
  onChunk: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onToolCallChunk?: (toolCallDelta: unknown) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
}

/**
 * Fetch models from hermes-agent's proxy endpoint (if available).
 * Falls back to /v1/models if the proxy is unreachable.
 */
export async function fetchModels(
  endpoint: string,
): Promise<{ models: Model[]; defaultModel: string }> {
  try {
    const response = await fetch(`${endpoint}/api/models`);
    if (!response.ok) {
      throw new Error(`Failed to fetch models: ${response.status}`);
    }
    const data: unknown = await response.json();
    const parsed = ModelsResponseSchema.safeParse(data);
    if (parsed.success && parsed.data.data) {
      return {
        models: parsed.data.data,
        defaultModel:
          parsed.data.default_model || (parsed.data.data[0]?.id ?? ""),
      };
    }
  } catch (error: unknown) {
    logger.debug({ error }, "Failed to fetch models");
  }
  return { models: [], defaultModel: "" };
}

export async function sendChatMessageStream({
  endpoint,
  model,
  messages,
  systemPrompt,
  conversationId,
  onChunk,
  onReasoningChunk,
  onToolCallChunk,
  onDone,
  onError,
  signal,
}: SendChatMessageStreamOptions): Promise<void> {
  try {
    // Prepare conversation messages payload
    const payloadMessages: Omit<ChatMessage, "id">[] = [];
    if (systemPrompt) {
      payloadMessages.push({ role: "system", content: systemPrompt });
    }

    // Map internal message roles
    messages.forEach((msg) => {
      payloadMessages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    const apiBase = endpoint.replace(/\/$/, "");
    const body = {
      model: model,
      messages: payloadMessages,
      stream: true,
    };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (conversationId) {
      headers["X-Conversation-Id"] = conversationId;
    }

    const response = await fetch(`${apiBase}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `API error (${response.status}): ${errorText || response.statusText}`,
      );
    }

    if (!response.body) {
      throw new Error("Response body is null");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    // Map hermes toolCallIds to standard array indices for the UI state
    let currentToolIndex = 0;
    const toolIndexMap = new Map<string, number>();

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");

      // Keep the last incomplete line in the buffer
      const lastLine = lines.pop();
      buffer = lastLine !== undefined ? lastLine : "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("data: ")) {
          const dataContent = trimmed.substring(6).trim();
          if (dataContent === "[DONE]") {
            onDone();
            return;
          }

          try {
            const parsed = JSON.parse(dataContent);

            // Handle standard OpenAI format
            const delta = parsed.choices?.[0]?.delta || {};
            if (delta.content) {
              onChunk(delta.content);
            }
            if (delta.reasoning_content && onReasoningChunk) {
              onReasoningChunk(delta.reasoning_content);
            }
            if (delta.tool_calls && onToolCallChunk) {
              for (const tc of delta.tool_calls) {
                onToolCallChunk(tc);
              }
            }

            // Handle Hermes custom tool events
            if (parsed.toolCallId && parsed.tool && onToolCallChunk) {
              if (!toolIndexMap.has(parsed.toolCallId)) {
                toolIndexMap.set(parsed.toolCallId, currentToolIndex++);
              }
              const idx = toolIndexMap.get(parsed.toolCallId);

              onToolCallChunk({
                index: idx,
                id: parsed.toolCallId,
                type: "function",
                function: {
                  name: parsed.tool,
                  arguments: parsed.label || "",
                },
                status: parsed.status,
              });
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // Flush any remaining buffer
    if (buffer && buffer.startsWith("data: ")) {
      const dataContent = buffer.substring(6).trim();
      if (dataContent !== "[DONE]") {
        try {
          const parsed = JSON.parse(dataContent);
          const delta = parsed.choices?.[0]?.delta || {};
          if (delta.content) {
            onChunk(delta.content);
          }
          if (delta.reasoning_content && onReasoningChunk) {
            onReasoningChunk(delta.reasoning_content);
          }
          if (delta.tool_calls && onToolCallChunk) {
            for (const tc of delta.tool_calls) {
              onToolCallChunk(tc);
            }
          }

          if (parsed.toolCallId && parsed.tool && onToolCallChunk) {
            if (!toolIndexMap.has(parsed.toolCallId)) {
              toolIndexMap.set(parsed.toolCallId, currentToolIndex++);
            }
            const idx = toolIndexMap.get(parsed.toolCallId);
            onToolCallChunk({
              index: idx,
              id: parsed.toolCallId,
              type: "function",
              function: {
                name: parsed.tool,
                arguments: parsed.label || "",
              },
              status: parsed.status,
            });
          }
        } catch {
          // ignore
        }
      }
    }

    onDone();
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      // User aborted stream, do not trigger error callback
      onDone();
    } else {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

export interface PendingApproval {
  id: string;
  tool: string;
  command: string;
  label?: string;
  risk_level?: string;
  session_id?: string;
}

export async function compressSession(endpoint: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${endpoint.replace(/\/$/, "")}/api/session/compress`,
      {
        method: "POST",
      },
    );
    return response.ok;
  } catch (error: unknown) {
    logger.error({ error }, "Failed to compress session");
    return false;
  }
}

// --- Conversations API ---

export async function fetchConversations(endpoint: string): Promise<ConversationAPI[]> {
  try {
    const res = await fetch(`${endpoint.replace(/\/$/, "")}/api/conversations`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    const parsed = z.array(ConversationSchema).safeParse(data);
    if (parsed.success) {
      return parsed.data;
    } else {
      logger.error({ error: parsed.error }, "Failed to parse conversations list");
      return [];
    }
  } catch (e) {
    logger.error({ error: e }, "Failed to fetch conversations");
    return [];
  }
}

export async function fetchConversation(
  endpoint: string,
  id: string,
): Promise<ConversationAPI | null> {
  try {
    const res = await fetch(
      `${endpoint.replace(/\/$/, "")}/api/conversations/${id}`,
    );
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const parsed = ConversationSchema.safeParse(data);
    if (parsed.success) {
      return parsed.data;
    } else {
      logger.error({ error: parsed.error }, "Failed to parse conversation detail");
      return null;
    }
  } catch (e) {
    logger.error({ error: e }, "Failed to fetch conversation details");
    return null;
  }
}

export async function createConversation(
  endpoint: string,
  conversation: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${endpoint.replace(/\/$/, "")}/api/conversations`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(conversation),
      },
    );
    return res.ok;
  } catch (e) {
    logger.error({ error: e }, "Failed to create conversation");
    return false;
  }
}

export async function deleteConversation(
  endpoint: string,
  id: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${endpoint.replace(/\/$/, "")}/api/conversations/${id}`,
      {
        method: "DELETE",
      },
    );
    return res.ok;
  } catch (e) {
    logger.error({ error: e }, "Failed to delete conversation");
    return false;
  }
}

export async function deleteAllConversations(
  endpoint: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${endpoint.replace(/\/$/, "")}/api/conversations`,
      {
        method: "DELETE",
      },
    );
    return res.ok;
  } catch (e) {
    logger.error({ error: e }, "Failed to delete all conversations");
    return false;
  }
}

export async function updateConversationTitle(
  endpoint: string,
  id: string,
  title: string,
): Promise<boolean> {
  try {
    const res = await fetch(
      `${endpoint.replace(/\/$/, "")}/api/conversations/${id}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      },
    );
    return res.ok;
  } catch (e) {
    logger.error({ error: e }, "Failed to update conversation title");
    return false;
  }
}
