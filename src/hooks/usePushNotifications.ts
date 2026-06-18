import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  isPushSupported,
  isSubscribedToPush,
  getNotificationPermission,
  requestNotificationPermission,
  subscribeToPush,
  unsubscribeFromPush,
  registerServiceWorker,
} from "../utils";

export type PushNotificationState = {
  isEnabled: boolean;
  isLoading: boolean;
  isSupported: boolean;
  status: string | null;
  togglePush: () => Promise<void>;
};

export const usePushNotifications = (
  isActive: boolean,
): PushNotificationState => {
  const { t } = useTranslation();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  const checkStatus = useCallback(async () => {
    if (!isPushSupported()) {
      setIsSupported(false);
      setStatus(t("settings.push.status.notSupported"));
      return;
    }

    try {
      // Ensure service worker is registered
      await registerServiceWorker();

      const permission = getNotificationPermission();
      if (permission === "denied") {
        setIsEnabled(false);
        setStatus(t("settings.push.status.blocked"));
        return;
      }

      const subscribed = await isSubscribedToPush();
      setIsEnabled(subscribed);
      if (subscribed) {
        setStatus(t("settings.push.status.subscribed"));
      } else {
        setStatus(t("settings.push.status.unsubscribed"));
      }
    } catch {
      setStatus(t("settings.push.status.error"));
    }
  }, [t]);

  useEffect(() => {
    const runCheck = async () => {
      await checkStatus();
    };
    if (isActive) {
      void runCheck();
    }
  }, [isActive, checkStatus]);

  const togglePush = async () => {
    if (isLoading || !isSupported) return;

    setIsLoading(true);
    setStatus(null);

    try {
      if (isEnabled) {
        // Unsubscribe
        const success = await unsubscribeFromPush();
        if (success) {
          setIsEnabled(false);
          setStatus(t("settings.push.status.unsubscribed"));
        } else {
          setStatus(t("settings.push.status.error"));
        }
      } else {
        // Subscribe
        let permission = getNotificationPermission();
        if (permission === "default") {
          permission = await requestNotificationPermission();
        }

        if (permission === "granted") {
          const subscription = await subscribeToPush();
          if (subscription) {
            setIsEnabled(true);
            setStatus(t("settings.push.status.subscribed"));
          } else {
            setStatus(t("settings.push.status.error"));
          }
        } else if (permission === "denied") {
          setStatus(t("settings.push.status.blocked"));
        }
      }
    } catch {
      setStatus(t("settings.push.status.error"));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    isEnabled,
    isLoading,
    isSupported,
    status,
    togglePush,
  };
};
