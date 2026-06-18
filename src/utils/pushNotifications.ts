import { logger } from "./logger";

export type PushSubscriptionData = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
};

/**
 * Base64url encode/decode utilities for VAPID keys.
 * Web Push requires URL-safe base64 without padding.
 */
const urlBase64ToArrayBuffer = (base64String: string): ArrayBuffer => {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
};

const arrayBufferToBase64Url = (buffer: ArrayBuffer | null): string => {
  if (!buffer) return "";
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window
    .btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

export const registerServiceWorker =
  async (): Promise<ServiceWorkerRegistration | null> => {
    if (!("serviceWorker" in navigator)) {
      return null;
    }
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      return registration;
    } catch (error) {
      logger.error({ error }, "Failed to register service worker");
      return null;
    }
  };

export const isPushSupported = (): boolean => {
  return "serviceWorker" in navigator && "PushManager" in window;
};

export const getNotificationPermission = (): NotificationPermission => {
  if (!("Notification" in window)) {
    return "denied";
  }
  return Notification.permission;
};

export const requestNotificationPermission =
  async (): Promise<NotificationPermission> => {
    if (!("Notification" in window)) {
      return "denied";
    }
    return await Notification.requestPermission();
  };

export const isSubscribedToPush = async (): Promise<boolean> => {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    return !!subscription;
  } catch (error) {
    logger.error({ error }, "Error checking push subscription");
    return false;
  }
};

export const subscribeToPush = async (
  apiBase: string = "",
): Promise<PushSubscriptionData | null> => {
  if (!isPushSupported()) {
    logger.error({}, "Push not supported");
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.ready;

    // Get VAPID public key
    const vapidResponse = await fetch(`${apiBase}/api/push/vapid-public-key`);
    if (!vapidResponse.ok) {
      throw new Error(`Failed to fetch VAPID key: ${vapidResponse.statusText}`);
    }
    const { publicKey } = await vapidResponse.json();
    const applicationServerKey = urlBase64ToArrayBuffer(publicKey);

    // Subscribe via browser PushManager
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    const p256dhBuffer = subscription.getKey("p256dh");
    const authBuffer = subscription.getKey("auth");

    if (!p256dhBuffer || !authBuffer) {
      throw new Error("Subscription keys are missing");
    }

    const subscriptionData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: arrayBufferToBase64Url(p256dhBuffer),
        auth: arrayBufferToBase64Url(authBuffer),
      },
    };

    // Send subscription to backend
    const saveResponse = await fetch(`${apiBase}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscriptionData),
    });

    if (!saveResponse.ok) {
      throw new Error(
        `Failed to save subscription: ${saveResponse.statusText}`,
      );
    }

    return subscriptionData;
  } catch (error) {
    logger.error({ error }, "Failed to subscribe to push notifications");
    return null;
  }
};

export const unsubscribeFromPush = async (
  apiBase: string = "",
): Promise<boolean> => {
  if (!isPushSupported()) return false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      // Send unsubscribe to backend first
      const endpoint = subscription.endpoint;
      const response = await fetch(`${apiBase}/api/push/unsubscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });

      if (!response.ok) {
        logger.error({ status: response.status }, "Backend unsubscribe failed");
      }

      // Unsubscribe locally
      const successful = await subscription.unsubscribe();
      return successful;
    }
    return true; // Already unsubscribed
  } catch (error) {
    logger.error({ error }, "Failed to unsubscribe from push notifications");
    return false;
  }
};
