import { randomBytes } from "node:crypto";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { DashboardImportError, importAssistantSession } from "./dashboard.js";
import { readJsonFile, writeJsonFileAtomic } from "./files.js";
import {
  deliverNotification,
  matchesBearer,
  type NotificationPayload,
} from "./notifications.js";

const MAX_IDEMPOTENCY_RECORDS = 500;
const ProactiveMessageSchema = z.object({
  request_id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_.:-]+$/),
  title: z.string().min(1).max(200).default("Hermes Agent"),
  message: z.string().min(1).max(65_536),
});

type ProactiveRecord = {
  stored_at: number;
  result: Record<string, unknown>;
};

const loadRecords = async (
  config: ServerConfig,
): Promise<Record<string, ProactiveRecord>> => {
  const payload = await readJsonFile<unknown>(config.proactiveRequestsFile, {});
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    return {};
  return Object.fromEntries(
    Object.entries(payload).filter(
      (entry): entry is [string, ProactiveRecord] => {
        const value = entry[1];
        if (!value || typeof value !== "object" || Array.isArray(value))
          return false;
        const record = value as Record<string, unknown>;
        return (
          typeof record.stored_at === "number" &&
          Boolean(record.result) &&
          typeof record.result === "object" &&
          !Array.isArray(record.result)
        );
      },
    ),
  );
};

export type ProactiveDependencies = {
  importSession: typeof importAssistantSession;
  push: typeof deliverNotification;
};

const defaultDependencies: ProactiveDependencies = {
  importSession: importAssistantSession,
  push: deliverNotification,
};

let orchestrationTail: Promise<void> = Promise.resolve();
const exclusive = async <T>(operation: () => Promise<T>): Promise<T> => {
  const previous = orchestrationTail;
  let release: () => void = () => undefined;
  orchestrationTail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
};

const overallStatus = (persisted: boolean, pushStatus: string): string => {
  if (persisted && pushStatus === "sent") return "complete";
  if (persisted || ["sent", "partial"].includes(pushStatus)) return "partial";
  return "failed";
};

const saveRecords = async (
  config: ServerConfig,
  records: Record<string, ProactiveRecord>,
): Promise<void> => {
  const bounded = Object.fromEntries(
    Object.entries(records)
      .sort((left, right) => right[1].stored_at - left[1].stored_at)
      .slice(0, MAX_IDEMPOTENCY_RECORDS),
  );
  await writeJsonFileAtomic(config.proactiveRequestsFile, bounded);
};

export const createProactiveMessage = async (
  config: ServerConfig,
  authorization: string,
  input: unknown,
  dependencies: ProactiveDependencies = defaultDependencies,
): Promise<Response> => {
  if (!config.pushApiKey) {
    return Response.json(
      { detail: "Proactive messaging is not configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (!matchesBearer(authorization, config.pushApiKey)) {
    return Response.json({ detail: "Unauthorized" }, { status: 401 });
  }
  const parsed = ProactiveMessageSchema.safeParse(input);
  if (!parsed.success) {
    return Response.json(
      { detail: "Invalid proactive message" },
      { status: 422 },
    );
  }

  return exclusive(async () => {
    const records = await loadRecords(config);
    const existing: ProactiveRecord | undefined = Object.hasOwn(
      records,
      parsed.data.request_id,
    )
      ? records[parsed.data.request_id]
      : undefined;
    if (existing) {
      return Response.json({ ...existing.result, replayed: true });
    }

    const sessionId = `proactive_${Date.now()}_${randomBytes(4).toString("hex")}`;
    let persisted = false;
    let persistenceError: string | undefined;
    try {
      await dependencies.importSession(
        config,
        sessionId,
        parsed.data.title,
        parsed.data.message,
      );
      persisted = true;
    } catch (error) {
      persistenceError =
        error instanceof DashboardImportError
          ? error.code
          : "dashboard_unavailable";
    }

    const notification: NotificationPayload = {
      title: parsed.data.title,
      body: (persisted
        ? parsed.data.message
        : `Conversation was not saved. ${parsed.data.message}`
      ).slice(0, 500),
      url: persisted ? `/?session=${encodeURIComponent(sessionId)}` : "/",
      tag: `proactive-${parsed.data.request_id}`,
      notification_id: parsed.data.request_id,
      session_id: persisted ? sessionId : null,
    };
    const pushResult = await dependencies.push(config, notification);
    const result = {
      status: overallStatus(persisted, pushResult.status),
      session: {
        persisted,
        ...(persisted ? { id: sessionId } : {}),
        ...(persistenceError ? { error: persistenceError } : {}),
      },
      push: pushResult,
      replayed: false,
    };
    records[parsed.data.request_id] = {
      stored_at: Date.now() / 1000,
      result,
    };
    await saveRecords(config, records);
    return Response.json(result);
  });
};
