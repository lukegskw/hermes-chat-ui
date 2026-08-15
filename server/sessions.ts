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

export const REASONING_INITIAL_DELAY_MS = 500;
export const REASONING_POLL_INTERVAL_MS = 750;
const encoder = new TextEncoder();

type MessageRow = Record<string, unknown>;
type ActiveSessionStream = {
  abortController: AbortController;
  connected: boolean;
  task: Promise<void>;
  lastReasoningSnapshot: string;
};

const activeStreams = new Map<string, ActiveSessionStream>();

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
  enqueue: (chunk: Uint8Array) => void,
): Promise<void> => {
  const messages = await fetchMessageRows(config, sessionId);
  if (!messages) return;
  const snapshot = reasoningAfterBoundary(messages, boundary);
  if (!snapshot || snapshot === active.lastReasoningSnapshot) return;
  active.lastReasoningSnapshot = snapshot;
  if (active.connected) enqueue(reasoningFrame(sessionId, snapshot));
};

const reconcileReasoning = async (
  config: ServerConfig,
  sessionId: string,
  active: ActiveSessionStream,
  boundary: number,
  enqueue: (chunk: Uint8Array) => void,
): Promise<void> => {
  await delay(REASONING_INITIAL_DELAY_MS, active.abortController.signal);
  while (!active.abortController.signal.aborted) {
    await queueReasoningSnapshot(config, sessionId, active, boundary, enqueue);
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
    return unavailableResponse(error);
  }
  if (upstream.status !== 200 || !upstream.body) {
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") || "application/json",
      },
    });
  }
  const upstreamBody = upstream.body;

  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const active: ActiveSessionStream = {
    abortController,
    connected: true,
    lastReasoningSnapshot: "",
    task: Promise.resolve(),
  };
  const readable = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
    },
    cancel() {
      active.connected = false;
    },
  });
  const enqueue = (chunk: Uint8Array) => {
    if (!active.connected) return;
    try {
      controller.enqueue(chunk);
    } catch {
      active.connected = false;
    }
  };

  active.task = (async () => {
    let eventBuffer = "";
    let completedContent = "";
    let cancelled = false;
    const reasoningTask =
      reasoningBoundary === undefined
        ? undefined
        : reconcileReasoning(
            config,
            sessionId,
            active,
            reasoningBoundary,
            enqueue,
          );
    try {
      const reader = upstreamBody.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        enqueue(value);
        eventBuffer += new TextDecoder().decode(value, { stream: true });
        const parsed = extractCompletedContent(eventBuffer);
        eventBuffer = parsed.remainder;
        if (parsed.completed) completedContent = parsed.completed;
      }
    } catch (error) {
      cancelled = abortController.signal.aborted;
      if (!cancelled) {
        enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : String(error) })}\n\n`,
          ),
        );
      }
    } finally {
      abortController.abort();
      await reasoningTask?.catch(() => undefined);
      if (reasoningBoundary !== undefined && active.connected && !cancelled) {
        await queueReasoningSnapshot(
          config,
          sessionId,
          active,
          reasoningBoundary,
          enqueue,
        );
      }
      if (active.connected) controller.close();
      if (activeStreams.get(sessionId) === active)
        activeStreams.delete(sessionId);
      if (completedContent) {
        await sendCompletionNotification(
          config,
          sessionId,
          completedContent,
        ).catch((error) =>
          console.error("[push] Completion notification failed:", error),
        );
      }
    }
  })();
  activeStreams.set(sessionId, active);

  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
      "X-Hermes-Session-Id":
        upstream.headers.get("X-Hermes-Session-Id") || sessionId,
    },
  });
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
