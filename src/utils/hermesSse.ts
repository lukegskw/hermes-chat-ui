import type { GenerationSnapshot, ToolCall } from "../types";

export type SsePayload = Record<string, unknown>;

export type ParsedSseEvent = {
  event: string;
  payload: SsePayload;
};

export type NormalizedHermesEvent =
  | { kind: "assistant_delta"; text: string }
  | { kind: "reasoning_delta"; text: string }
  | { kind: "reasoning_snapshot"; text: string }
  | { kind: "generation_snapshot"; snapshot: GenerationSnapshot }
  | {
      kind: "tool";
      event: "tool.started" | "tool.completed" | "tool.failed";
      name: string;
      id?: string;
      preview?: string;
      args?: unknown;
    }
  | { kind: "error"; message: string }
  | { kind: "done" }
  | { kind: "ignored" };

const parseSseBlock = (block: string): ParsedSseEvent | null => {
  let event = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
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

export class HermesSseParser {
  private buffer = "";

  push(chunk: string, final = false): ParsedSseEvent[] {
    this.buffer += chunk;
    // Keep a trailing CR until the next chunk so a split CRLF remains one
    // delimiter. At EOF, tolerate old servers that use bare CR separators.
    this.buffer = this.buffer.replace(/\r\n/g, "\n");
    if (final) this.buffer = this.buffer.replace(/\r/g, "\n");

    const parsed: ParsedSseEvent[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      const event = parseSseBlock(block);
      if (event) parsed.push(event);
      boundary = this.buffer.indexOf("\n\n");
    }

    if (final && this.buffer.trim()) {
      const event = parseSseBlock(this.buffer);
      if (event) parsed.push(event);
      this.buffer = "";
    }
    return parsed;
  }
}

const stringValue = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

const terminalReasoning = (payload: SsePayload): string => {
  if (!Array.isArray(payload.messages)) return "";
  return payload.messages
    .flatMap((message: unknown) => {
      if (!message || typeof message !== "object") return [];
      const record = message as Record<string, unknown>;
      if (record.role !== "assistant") return [];
      const reasoning = stringValue(
        record.reasoning_content ?? record.reasoning,
      );
      return reasoning ? [reasoning] : [];
    })
    .join("\n\n");
};

const snapshotToolCalls = (value: unknown): ToolCall[] =>
  Array.isArray(value)
    ? value.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const record = item as Record<string, unknown>;
        const fn =
          record.function && typeof record.function === "object"
            ? (record.function as Record<string, unknown>)
            : {};
        const id = stringValue(record.id);
        const name = stringValue(fn.name);
        if (!id || !name) return [];
        const rawStatus = stringValue(record.status);
        const status = ["running", "completed", "error"].includes(
          rawStatus ?? "",
        )
          ? (rawStatus as ToolCall["status"])
          : "running";
        return [
          {
            id,
            type: stringValue(record.type) ?? "function",
            function: {
              name,
              arguments: stringValue(fn.arguments) ?? "",
            },
            status,
            label: stringValue(record.label) ?? name,
          },
        ];
      })
    : [];

export const normalizeHermesEvent = ({
  event,
  payload,
}: ParsedSseEvent): NormalizedHermesEvent => {
  if (event === "generation.snapshot") {
    const sessionId = stringValue(payload.session_id);
    const messageId = stringValue(payload.message_id);
    if (!sessionId || !messageId) return { kind: "ignored" };
    return {
      kind: "generation_snapshot",
      snapshot: {
        sessionId,
        messageId,
        content: stringValue(payload.content) ?? "",
        reasoningContent: stringValue(payload.reasoning_content) ?? "",
        toolCalls: snapshotToolCalls(payload.tool_calls),
      },
    };
  }

  if (
    (event === "message.delta" || event === "assistant.delta") &&
    typeof payload.delta === "string"
  ) {
    return { kind: "assistant_delta", text: payload.delta };
  }

  if (event === "reasoning.available") {
    const text = stringValue(payload.text ?? payload.delta ?? payload.preview);
    return text ? { kind: "reasoning_delta", text } : { kind: "ignored" };
  }

  if (event === "reasoning.snapshot") {
    const text = stringValue(payload.text);
    return text ? { kind: "reasoning_snapshot", text } : { kind: "ignored" };
  }

  if (event === "tool.progress") {
    const toolName = stringValue(payload.tool_name ?? payload.tool);
    const text = stringValue(payload.delta ?? payload.text ?? payload.preview);
    if (toolName === "_thinking" && text) {
      return { kind: "reasoning_delta", text };
    }
    return { kind: "ignored" };
  }

  if (event === "run.completed") {
    const text = terminalReasoning(payload);
    return text ? { kind: "reasoning_snapshot", text } : { kind: "ignored" };
  }

  if (
    event === "tool.started" ||
    event === "tool.completed" ||
    event === "tool.failed"
  ) {
    return {
      kind: "tool",
      event,
      name: stringValue(payload.tool_name ?? payload.tool) ?? "tool",
      id: stringValue(payload.tool_call_id ?? payload.toolCallId),
      preview: stringValue(payload.preview ?? payload.label),
      args: payload.args,
    };
  }

  if (event === "error") {
    return {
      kind: "error",
      message: stringValue(payload.message) ?? "Hermes stream failed",
    };
  }
  if (event === "done") return { kind: "done" };
  return { kind: "ignored" };
};
