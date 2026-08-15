import { createPrivateKey } from "node:crypto";
import webPush from "web-push";
import type { ServerConfig } from "./config.js";
import { readJsonFile, writeJsonFileAtomic } from "./files.js";

export type PushSubscription = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

type StoredVapidKeys = { private_key: string; public_key: string };

const validKeys = (value: unknown): value is StoredVapidKeys => {
  if (!value || typeof value !== "object") return false;
  const keys = value as Record<string, unknown>;
  return (
    typeof keys.private_key === "string" &&
    Boolean(keys.private_key) &&
    typeof keys.public_key === "string" &&
    Boolean(keys.public_key)
  );
};

export const getVapidKeys = async (
  config: ServerConfig,
): Promise<StoredVapidKeys> => {
  const existing = await readJsonFile<unknown>(config.vapidKeysFile, null);
  if (validKeys(existing)) return existing;

  const generated = webPush.generateVAPIDKeys();
  const keys = {
    private_key: generated.privateKey,
    public_key: generated.publicKey,
  };
  await writeJsonFileAtomic(config.vapidKeysFile, keys);
  console.info(`[push] Generated VAPID keys at ${config.vapidKeysFile}`);
  return keys;
};

const privateKeyForWebPush = (privateKey: string): string => {
  if (!privateKey.includes("BEGIN PRIVATE KEY")) return privateKey;
  const jwk = createPrivateKey(privateKey).export({ format: "jwk" });
  if (!jwk.d) throw new Error("VAPID private key is invalid");
  return jwk.d;
};

export const sendPushNotification = async (
  config: ServerConfig,
  subscription: PushSubscription,
  data: Record<string, unknown>,
): Promise<boolean> => {
  try {
    const keys = await getVapidKeys(config);
    webPush.setVapidDetails(
      config.vapidSubject,
      keys.public_key,
      privateKeyForWebPush(keys.private_key),
    );
    await webPush.sendNotification(subscription, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("[push] Failed to send notification:", error);
    return false;
  }
};
