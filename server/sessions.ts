import { randomUUID } from "node:crypto";
import type { ServerConfig } from "./config.js";
import {
  hermesHeaders,
  hermesUrl,
  proxyHermes,
  safeJsonBody,
  unavailableResponse,
} from "./hermes-client.js";
import { deliverNotification, isAnyClientVisible } from "./notifications.js";
import type { AttachmentStore } from "./attachments.js";

export const REASONING_INITIAL_DELAY_MS = 500;
export const REASONING_POLL_INTERVAL_MS = 750;
const encoder = new TextEncoder();

type MessageRow = Record<string, unknown>;
type GenerationToolSnapshot = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
  status: "running" | "completed" | "error";
  label: string;
};
type GenerationSnapshot = {
  session_id: string;
  message_id: string;
  content: string;
  reasoning_content: string;
  tool_calls: GenerationToolSnapshot[];
};
type StreamSubscriber = {
  controller: ReadableStreamDefaultController<Uint8Array>;
};
type ActiveSessionStream = {
  abortController: AbortController;
  subscribers: Set<StreamSubscriber>;
  task: Promise<void>;
  lastReasoningSnapshot: string;
  snapshot: GenerationSnapshot;
  completedContent: string;
};

type ParsedSseFrame = {
  event: string;
  payload?: Record<string, unknown>;
  bytes: Uint8Array;
};

class SessionSseParser {
  private readonly decoder = new TextDecoder();
  private buffer = "";

  push(chunk?: Uint8Array, final = false): ParsedSseFrame[] {
    if (chunk) this.buffer += this.decoder.decode(chunk, { stream: !final });
    else if (final) this.buffer += this.decoder.decode();
    this.buffer = this.buffer.replaceAll("\r\n", "\n");
    if (final) this.buffer = this.buffer.replaceAll("\r", "\n");

    const frames: ParsedSseFrame[] = [];
    let boundary = this.buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const block = this.buffer.slice(0, boundary);
      this.buffer = this.buffer.slice(boundary + 2);
      frames.push(this.parse(block));
      boundary = this.buffer.indexOf("\n\n");
    }
    if (final && this.buffer.trim()) {
      frames.push(this.parse(this.buffer));
      this.buffer = "";
    }
    return frames;
  }

  private parse(block: string): ParsedSseFrame {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:"))
        dataLines.push(line.slice(5).trimStart());
    }
    let payload: Record<string, unknown> | undefined;
    if (dataLines.length > 0) {
      try {
        const parsed: unknown = JSON.parse(dataLines.join("\n"));
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          payload = parsed as Record<string, unknown>;
        }
      } catch {
        // Preserve malformed/forward-compatible frames for the browser.
      }
    }
    return { event, payload, bytes: encoder.encode(`${block}\n\n`) };
  }
}

const activeStreams = new Map<string, ActiveSessionStream>();

const stringValue = (value: unknown): string =>
  typeof value === "string" ? value : "";

const terminalReasoning = (payload: Record<string, unknown>): string =>
  Array.isArray(payload.messages)
    ? payload.messages
        .flatMap((message) => {
          if (!message || typeof message !== "object") return [];
          const record = message as Record<string, unknown>;
          if (record.role !== "assistant") return [];
          const reasoning = stringValue(
            record.reasoning_content ?? record.reasoning,
          );
          return reasoning ? [reasoning] : [];
        })
        .join("\n\n")
    : "";

const broadcast = (active: ActiveSessionStream, chunk: Uint8Array): void => {
  for (const subscriber of [...active.subscribers]) {
    try {
      subscriber.controller.enqueue(chunk);
    } catch {
      active.subscribers.delete(subscriber);
    }
  }
};

const closeSubscribers = (active: ActiveSessionStream): void => {
  for (const subscriber of [...active.subscribers]) {
    try {
      subscriber.controller.close();
    } catch {
      // The browser may already have disconnected.
    }
  }
  active.subscribers.clear();
};

const generationSnapshotFrame = (active: ActiveSessionStream): Uint8Array =>
  encoder.encode(
    `event: generation.snapshot\ndata: ${JSON.stringify(active.snapshot)}\n\n`,
  );

const streamResponse = (
  active: ActiveSessionStream,
  options: { includeSnapshot: boolean; sessionId: string },
): Response => {
  let subscriber!: StreamSubscriber;
  const readable = new ReadableStream<Uint8Array>({
    start(controller) {
      subscriber = { controller };
      active.subscribers.add(subscriber);
      if (options.includeSnapshot) {
        controller.enqueue(generationSnapshotFrame(active));
      }
    },
    cancel() {
      active.subscribers.delete(subscriber);
    },
  });
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      "X-Hermes-Session-Id": options.sessionId,
      "X-Hermes-Generation-Id": active.snapshot.message_id,
    },
  });
};

const updateToolSnapshot = (
  active: ActiveSessionStream,
  event: string,
  payload: Record<string, unknown>,
): void => {
  const name = stringValue(payload.tool_name ?? payload.tool) || "tool";
  const suppliedId = stringValue(payload.tool_call_id ?? payload.toolCallId);
  const existing = suppliedId
    ? active.snapshot.tool_calls.find((tool) => tool.id === suppliedId)
    : [...active.snapshot.tool_calls]
        .reverse()
        .find(
          (tool) => tool.function.name === name && tool.status === "running",
        );
  const tool =
    existing ??
    ({
      id:
        suppliedId ||
        `${stringValue(payload.message_id) || active.snapshot.message_id}_${active.snapshot.tool_calls.length}`,
      type: "function",
      function: { name, arguments: "" },
      status: "running",
      label: stringValue(payload.preview ?? payload.label) || name,
    } satisfies GenerationToolSnapshot);
  if (!existing) active.snapshot.tool_calls.push(tool);
  tool.status =
    event === "tool.started"
      ? "running"
      : event === "tool.failed"
        ? "error"
        : "completed";
  if (payload.args !== undefined) {
    tool.function.arguments =
      typeof payload.args === "string"
        ? payload.args
        : JSON.stringify(payload.args);
  }
  const label = stringValue(payload.preview ?? payload.label);
  if (label) tool.label = label;
};

const updateGenerationSnapshot = (
  active: ActiveSessionStream,
  frame: ParsedSseFrame,
): void => {
  const payload = frame.payload;
  if (!payload) return;
  if (
    (frame.event === "assistant.delta" || frame.event === "message.delta") &&
    typeof payload.delta === "string"
  ) {
    active.snapshot.content += payload.delta;
  } else if (
    frame.event === "assistant.completed" &&
    typeof payload.content === "string"
  ) {
    active.snapshot.content = payload.content;
    active.completedContent = payload.content;
  } else if (frame.event === "reasoning.available") {
    active.snapshot.reasoning_content += stringValue(
      payload.text ?? payload.delta ?? payload.preview,
    );
  } else if (frame.event === "reasoning.snapshot") {
    active.snapshot.reasoning_content = stringValue(payload.text);
  } else if (frame.event === "tool.progress") {
    const name = stringValue(payload.tool_name ?? payload.tool);
    if (name === "_thinking") {
      active.snapshot.reasoning_content += stringValue(
        payload.delta ?? payload.text ?? payload.preview,
      );
    }
  } else if (
    frame.event === "tool.started" ||
    frame.event === "tool.completed" ||
    frame.event === "tool.failed"
  ) {
    updateToolSnapshot(active, frame.event, payload);
  } else if (frame.event === "run.completed") {
    const reasoning = terminalReasoning(payload);
    if (reasoning) active.snapshot.reasoning_content = reasoning;
    if (typeof payload.output === "string" && payload.output) {
      active.snapshot.content = payload.output;
      active.completedContent = payload.output;
    }
  }
};

export const sessionPath = (sessionId: string, suffix = ""): string =>
  `/api/sessions/${encodeURIComponent(sessionId)}${suffix}`;

const delay = (milliseconds: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export const cancelActiveStream = async (
  sessionId: string,
): Promise<boolean> => {
  const active = activeStreams.get(sessionId);
  if (!active) return false;
  active.abortController.abort();
  await active.task.catch(() => undefined);
  return true;
};

export const resumeActiveStream = (sessionId: string): Response => {
  const active = activeStreams.get(sessionId);
  return active
    ? streamResponse(active, { includeSnapshot: true, sessionId })
    : new Response(null, { status: 204 });
};

export const extractCompletedContent = (
  input: string,
): { remainder: string; completed: string } => {
  const normalized = input.replaceAll("\r\n", "\n");
  const blocks = normalized.split("\n\n");
  const remainder = blocks.pop() ?? "";
  let completed = "";
  for (const block of blocks) {
    let eventName = "";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) eventName = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (eventName !== "assistant.completed" || dataLines.length === 0) continue;
    try {
      const payload: unknown = JSON.parse(dataLines.join("\n"));
      if (
        payload &&
        typeof payload === "object" &&
        typeof (payload as Record<string, unknown>).content === "string"
      ) {
        completed = (payload as Record<string, string>).content;
      }
    } catch {
      // Ignore malformed supplementary notification data.
    }
  }
  return { remainder, completed };
};

const messageRows = (payload: unknown): MessageRow[] => {
  if (!payload || typeof payload !== "object") return [];
  const rows = (payload as Record<string, unknown>).data;
  return Array.isArray(rows)
    ? rows.filter(
        (row): row is MessageRow =>
          Boolean(row) && typeof row === "object" && !Array.isArray(row),
      )
    : [];
};

export const reasoningAfterBoundary = (
  messages: MessageRow[],
  boundary: number,
): string =>
  messages
    .slice(Math.max(0, boundary))
    .flatMap((message) => {
      if (message.role !== "assistant") return [];
      const value = message.reasoning_content || message.reasoning;
      return typeof value === "string" && value ? [value] : [];
    })
    .join("\n\n");

export const fetchMessageRows = async (
  config: ServerConfig,
  sessionId: string,
  fetcher: typeof fetch = fetch,
): Promise<MessageRow[] | undefined> => {
  try {
    const response = await fetcher(
      hermesUrl(config, sessionPath(sessionId, "/messages")),
      {
        headers: hermesHeaders(config),
        signal: AbortSignal.timeout(2_000),
      },
    );
    if (response.status !== 200) return undefined;
    return messageRows(await response.json());
  } catch {
    return undefined;
  }
};

const reasoningFrame = (sessionId: string, text: string): Uint8Array =>
  encoder.encode(
    `event: reasoning.snapshot\ndata: ${JSON.stringify({ session_id: sessionId, text })}\n\n`,
  );

const queueReasoningSnapshot = async (
  config: ServerConfig,
  sessionId: string,
  active: ActiveSessionStream,
  boundary: number,
): Promise<void> => {
  const messages = await fetchMessageRows(config, sessionId);
  if (!messages) return;
  const snapshot = reasoningAfterBoundary(messages, boundary);
  if (!snapshot || snapshot === active.lastReasoningSnapshot) return;
  active.lastReasoningSnapshot = snapshot;
  active.snapshot.reasoning_content = snapshot;
  broadcast(active, reasoningFrame(sessionId, snapshot));
};

const reconcileReasoning = async (
  config: ServerConfig,
  sessionId: string,
  active: ActiveSessionStream,
  boundary: number,
): Promise<void> => {
  await delay(REASONING_INITIAL_DELAY_MS, active.abortController.signal);
  while (!active.abortController.signal.aborted) {
    await queueReasoningSnapshot(config, sessionId, active, boundary);
    await delay(REASONING_POLL_INTERVAL_MS, active.abortController.signal);
  }
};

export const sendCompletionNotification = async (
  config: ServerConfig,
  sessionId: string,
  content: string,
): Promise<void> => {
  if (!content || isAnyClientVisible()) return;
  const trimmed = content.trim();
  const preview =
    trimmed.length > 100 ? `${trimmed.slice(0, 100)}...` : trimmed;
  await deliverNotification(config, {
    title: "New message",
    body: preview,
    url: `/?session=${encodeURIComponent(sessionId)}`,
    session_id: sessionId,
    notification_id: `${sessionId}:${randomUUID()}`,
  });
};

export const streamSessionChat = async (
  config: ServerConfig,
  sessionId: string,
  request: Request,
  attachments?: AttachmentStore,
): Promise<Response> => {
  if (activeStreams.has(sessionId)) {
    return Response.json(
      {
        detail: "A generation is already active for this session",
        code: "session_generation_active",
      },
      { status: 409 },
    );
  }

  const payload = await safeJsonBody(request);
  const baselineMessages = await fetchMessageRows(config, sessionId);
  const reasoningBoundary = baselineMessages?.length;
  let pendingAttachmentGroup: string | undefined;
  try {
    pendingAttachmentGroup = await attachments?.createPending(
      sessionId,
      payload,
      baselineMessages ?? [],
    );
  } catch (error) {
    return Response.json(
      {
        detail: "Image attachments are invalid or too large",
        code: error instanceof Error ? error.message : "invalid_attachment",
      },
      { status: 422 },
    );
  }
  const abortController = new AbortController();
  let upstream: Response;
  try {
    upstream = await fetch(
      hermesUrl(config, sessionPath(sessionId, "/chat/stream")),
      {
        method: "POST",
        headers: {
          ...Object.fromEntries(hermesHeaders(config, "text/event-stream")),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: abortController.signal,
      },
    );
  } catch (error) {
    if (pendingAttachmentGroup) {
      await attachments?.discardPending(pendingAttachmentGroup);
    }
    return unavailableResponse(error);
  }
  if (upstream.status !== 200 || !upstream.body) {
    if (pendingAttachmentGroup) {
      await attachments?.discardPending(pendingAttachmentGroup);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
      },
    });
  }
  const upstreamBody = upstream.body;

  if (attachments && pendingAttachmentGroup) {
    const groupId = pendingAttachmentGroup;
    void (async () => {
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const rows = await fetchMessageRows(config, sessionId);
        if (rows) {
          const bound = await attachments.reconcileSession(sessionId, rows);
          if (bound.includes(groupId)) return;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    })().catch((error) =>
      console.error("[attachments] Failed to bind pending images:", error),
    );
  }

  const effectiveSessionId =
    upstream.headers.get("X-Hermes-Session-Id") || sessionId;
  const active: ActiveSessionStream = {
    abortController,
    subscribers: new Set(),
    lastReasoningSnapshot: "",
    task: Promise.resolve(),
    snapshot: {
      session_id: effectiveSessionId,
      message_id: `generation_${randomUUID()}`,
      content: "",
      reasoning_content: "",
      tool_calls: [],
    },
    completedContent: "",
  };
  activeStreams.set(sessionId, active);
  const response = streamResponse(active, {
    includeSnapshot: true,
    sessionId: effectiveSessionId,
  });

  active.task = (async () => {
    let cancelled = false;
    const terminalFrame = { sent: false };
    const parser = new SessionSseParser();
    const reasoningTask =
      reasoningBoundary === undefined
        ? undefined
        : reconcileReasoning(config, sessionId, active, reasoningBoundary);
    const forwardFrames = (frames: ParsedSseFrame[]) => {
      for (const frame of frames) {
        updateGenerationSnapshot(active, frame);
        broadcast(active, frame.bytes);
        if (frame.event === "done") terminalFrame.sent = true;
      }
    };
    try {
      const reader = upstreamBody.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        forwardFrames(parser.push(value));
      }
      forwardFrames(parser.push(undefined, true));
    } catch (error) {
      cancelled = abortController.signal.aborted;
      if (!cancelled) {
        broadcast(
          active,
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : String(error) })}\n\n`,
          ),
        );
      }
    } finally {
      abortController.abort();
      await reasoningTask?.catch(() => undefined);
      if (reasoningBoundary !== undefined && !cancelled) {
        await queueReasoningSnapshot(
          config,
          sessionId,
          active,
          reasoningBoundary,
        );
      }
      if (!terminalFrame.sent) {
        broadcast(
          active,
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({ session_id: sessionId, cancelled })}\n\n`,
          ),
        );
      }
      closeSubscribers(active);
      if (activeStreams.get(sessionId) === active)
        activeStreams.delete(sessionId);
      if (active.completedContent) {
        await sendCompletionNotification(
          config,
          sessionId,
          active.completedContent,
        ).catch((error) =>
          console.error("[push] Completion notification failed:", error),
        );
      }
    }
  })();
  return response;
};

export const proxySessionRequest = (
  config: ServerConfig,
  method: string,
  pathname: string,
  request: Request,
  payload?: unknown,
): Promise<Response> =>
  proxyHermes(config, method, pathname, {
    query: new URL(request.url).searchParams.toString(),
    payload,
  });

export const getSessionMessages = async (
  config: ServerConfig,
  sessionId: string,
  request: Request,
  attachments: AttachmentStore,
): Promise<Response> => {
  const upstream = await proxySessionRequest(
    config,
    "GET",
    sessionPath(sessionId, "/messages"),
    request,
  );
  if (upstream.status !== 200) return upstream;
  const contentType =
    upstream.headers.get("Content-Type") || "application/json";
  const text = await upstream.text();
  try {
    const enriched = await attachments.enrichMessages(
      sessionId,
      JSON.parse(text),
    );
    return Response.json(enriched, { status: upstream.status });
  } catch (error) {
    console.error("[attachments] Failed to enrich message history:", error);
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": contentType },
    });
  }
};

export const deleteSession = async (
  config: ServerConfig,
  sessionId: string,
  request: Request,
  attachments: AttachmentStore,
): Promise<Response> => {
  await cancelActiveStream(sessionId);
  const response = await proxySessionRequest(
    config,
    "DELETE",
    sessionPath(sessionId),
    request,
  );
  if (response.ok) {
    await attachments
      .deleteSession(sessionId)
      .catch((error) =>
        console.error("[attachments] Failed to remove session images:", error),
      );
  }
  return response;
};
