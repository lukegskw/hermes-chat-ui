export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

const API_BASE = import.meta.env.VITE_HERMES_API_URL || '';

let swRegistration: ServiceWorkerRegistration | null = null;
let currentSubscription: PushSubscriptionData | null = null;

/**
 * Register the service worker and return the registration.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('[push] Service Worker not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    swRegistration = registration;
    console.log('[push] Service Worker registered');
    return registration;
  } catch (error) {
    console.error('[push] Service Worker registration failed:', error);
    return null;
  }
}

/**
 * Check if push notifications are supported and permission is granted.
 */
export function isPushSupported(): boolean {
  return 'PushManager' in window && 'serviceWorker' in navigator;
}

/**
 * Get the current notification permission state.
 */
export function getNotificationPermission(): NotificationPermission {
  return Notification.permission;
}

/**
 * Request notification permission from the user.
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isPushSupported()) {
    console.warn('[push] Push not supported');
    return 'denied';
  }

  const permission = await Notification.requestPermission();
  console.log('[push] Notification permission:', permission);
  return permission;
}

/**
 * Subscribe to push notifications.
 * Returns the subscription data or null if failed.
 */
export async function subscribeToPush(): Promise<PushSubscriptionData | null> {
  if (!swRegistration) {
    const reg = await registerServiceWorker();
    if (!reg) return null;
    swRegistration = reg;
  }

  try {
    // Get VAPID public key from server
    const response = await fetch(`${API_BASE}/api/push/vapid-public-key`);
    const { publicKey } = await response.json();

    // Subscribe
    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: publicKey,
    });

    // Convert to serializable format
    const subData: PushSubscriptionData = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.getKey('p256dh')
          ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!)))
          : '',
        auth: subscription.getKey('auth')
          ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)))
          : '',
      },
    };

    // Send subscription to server
    await fetch(`${API_BASE}/api/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(subData),
    });

    currentSubscription = subData;
    return subData;
  } catch (error) {
    console.error('[push] Push subscription failed:', error);
    return null;
  }
}

/**
 * Unsubscribe from push notifications.
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  if (!swRegistration) return false;

  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription) {
      const subData: PushSubscriptionData = {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.getKey('p256dh')
            ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('p256dh')!)))
            : '',
          auth: subscription.getKey('auth')
            ? btoa(String.fromCharCode(...new Uint8Array(subscription.getKey('auth')!)))
            : '',
        },
      };

      await subscription.unsubscribe();

      // Notify server
      await fetch(`${API_BASE}/api/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subData),
      });
    }

    currentSubscription = null;
    return true;
  } catch (error) {
    console.error('[push] Push unsubscriotion failed:', error);
    return false;
  }
}

/**
 * Check if the user is currently subscribed to push notifications.
 */
export async function isSubscribedToPush(): Promise<boolean> {
  if (!swRegistration) {
    const reg = await registerServiceWorker();
    if (!reg) return false;
    swRegistration = reg;
  }

  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    return subscription !== null;
  } catch {
    return false;
  }
}
