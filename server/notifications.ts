import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { ServerConfig } from "./config.js";
import { readJsonFile, writeJsonFileAtomic } from "./files.js";
import {
  getVapidKeys,
  sendPushNotification,
  type PushSubscription,
} from "./push.js";

export const PRESENCE_TTL_SECONDS = 45;
const visibleClients = new Map<string, number>();

export const NotificationPayloadSchema = z.object({
  title: z.string(),
  body: z.string(),
  url: z.string().nullish(),
  icon: z.string().nullish(),
  tag: z.string().nullish(),
  notification_id: z.string().nullish(),
  session_id: z.string().nullish(),
});
export type NotificationPayload = z.infer<typeof NotificationPayloadSchema>;

const PushSubscriptionSchema = z.object({
  endpoint: z.string(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
});

export const updateClientPresence = (
  clientId: string,
  visible: boolean,
  now = performance.now() / 1000,
): void => {
  if (visible) visibleClients.set(clientId, now);
  else visibleClients.delete(clientId);
};

export const isAnyClientVisible = (now = performance.now() / 1000): boolean => {
  const cutoff = now - PRESENCE_TTL_SECONDS;
  for (const [clientId, lastSeen] of visibleClients) {
    if (lastSeen < cutoff) visibleClients.delete(clientId);
  }
  return visibleClients.size > 0;
};

export const clearClientPresence = (): void => visibleClients.clear();

export const loadSubscriptions = async (
  config: ServerConfig,
): Promise<PushSubscription[]> => {
  const subscriptions = await readJsonFile<unknown>(
    config.subscriptionsFile,
    [],
  );
  const parsed = z.array(PushSubscriptionSchema).safeParse(subscriptions);
  return parsed.success ? parsed.data : [];
};

const saveSubscriptions = (
  config: ServerConfig,
  subscriptions: PushSubscription[],
): Promise<void> =>
  writeJsonFileAtomic(config.subscriptionsFile, subscriptions);

export const deliverNotification = async (
  config: ServerConfig,
  payload: NotificationPayload,
): Promise<{ status: string; sent: number; failed: number }> => {
  const subscriptions = await loadSubscriptions(config);
  if (subscriptions.length === 0) {
    return { status: "no_subscriptions", sent: 0, failed: 0 };
  }
  const results = await Promise.all(
    subscriptions.map((subscription) =>
      sendPushNotification(config, subscription, payload),
    ),
  );
  const sent = results.filter(Boolean).length;
  const failed = results.length - sent;
  return {
    status: sent > 0 && failed === 0 ? "sent" : sent > 0 ? "partial" : "failed",
    sent,
    failed,
  };
};

export const matchesBearer = (supplied: string, secret: string): boolean => {
  if (!secret) return false;
  const actual = Buffer.from(supplied);
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

export const notificationRoutes = {
  async vapidPublicKey(config: ServerConfig): Promise<Response> {
    try {
      return Response.json({
        publicKey: (await getVapidKeys(config)).public_key,
      });
    } catch {
      return Response.json(
        { detail: "VAPID public key is not configured" },
        { status: 503 },
      );
    }
  },
  presence(payload: unknown): Response {
    const parsed = z
      .object({
        client_id: z.string().min(1).max(128),
        visible: z.boolean(),
      })
      .safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { detail: "Invalid presence payload" },
        { status: 422 },
      );
    }
    updateClientPresence(parsed.data.client_id, parsed.data.visible);
    return Response.json({
      status: parsed.data.visible ? "visible" : "hidden",
    });
  },
  async subscribe(config: ServerConfig, payload: unknown): Promise<Response> {
    const parsed = PushSubscriptionSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { detail: "Invalid push subscription" },
        { status: 422 },
      );
    }
    const subscriptions = await loadSubscriptions(config);
    const index = subscriptions.findIndex(
      (subscription) => subscription.endpoint === parsed.data.endpoint,
    );
    if (index >= 0) {
      subscriptions[index] = parsed.data;
      await saveSubscriptions(config, subscriptions);
      return Response.json({ status: "updated" });
    }
    subscriptions.push(parsed.data);
    await saveSubscriptions(config, subscriptions);
    return Response.json({ status: "subscribed" });
  },
  async unsubscribe(config: ServerConfig, payload: unknown): Promise<Response> {
    const endpoint =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>).endpoint
        : undefined;
    if (typeof endpoint !== "string" || !endpoint) {
      return Response.json({ detail: "endpoint is required" }, { status: 400 });
    }
    const subscriptions = (await loadSubscriptions(config)).filter(
      (subscription) => subscription.endpoint !== endpoint,
    );
    await saveSubscriptions(config, subscriptions);
    return Response.json({ status: "unsubscribed" });
  },
  async send(
    config: ServerConfig,
    authorization: string,
    payload: unknown,
  ): Promise<Response> {
    if (!config.pushApiKey) {
      return Response.json(
        { detail: "Push API is not configured" },
        { status: 503 },
      );
    }
    if (!matchesBearer(authorization, config.pushApiKey)) {
      return Response.json({ detail: "Unauthorized" }, { status: 401 });
    }
    const parsed = NotificationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return Response.json(
        { detail: "Invalid notification payload" },
        { status: 422 },
      );
    }
    return Response.json(await deliverNotification(config, parsed.data));
  },
};
