import { useEffect, useRef } from "react";
import { logger } from "../utils/logger";

export const PRESENCE_INTERVAL_MS = 15_000;

const apiBase = (endpoint: string) => endpoint.replace(/\/$/, "");

export const createPresenceClientId = (): string => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
};

export const publishClientPresence = async (
  endpoint: string,
  clientId: string,
  visible: boolean,
  keepalive = false,
): Promise<void> => {
  const response = await fetch(`${apiBase(endpoint)}/api/push/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, visible }),
    keepalive,
  });
  if (!response.ok) {
    throw new Error(`Presence update failed with status ${response.status}`);
  }
};

export const useClientPresence = (endpoint: string): void => {
  const clientIdRef = useRef<string | null>(null);
  if (clientIdRef.current === null) {
    clientIdRef.current = createPresenceClientId();
  }

  useEffect(() => {
    const clientId = clientIdRef.current;
    if (!clientId) return;

    let intervalId: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    const report = (visible: boolean, keepalive = false) => {
      void publishClientPresence(endpoint, clientId, visible, keepalive).catch(
        (error: unknown) => {
          if (!stopped) {
            logger.debug({ error }, "Could not update client presence");
          }
        },
      );
    };

    const stopHeartbeat = () => {
      if (intervalId !== undefined) clearInterval(intervalId);
      intervalId = undefined;
    };

    const syncVisibility = () => {
      stopHeartbeat();
      if (document.visibilityState === "visible") {
        report(true);
        intervalId = setInterval(() => report(true), PRESENCE_INTERVAL_MS);
      } else {
        report(false, true);
      }
    };

    const handlePageHide = () => {
      stopHeartbeat();
      report(false, true);
    };

    syncVisibility();
    document.addEventListener("visibilitychange", syncVisibility);
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", syncVisibility);

    return () => {
      stopped = true;
      stopHeartbeat();
      document.removeEventListener("visibilitychange", syncVisibility);
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", syncVisibility);
      void publishClientPresence(endpoint, clientId, false, true).catch(() => {
        // The server TTL is the fallback when teardown delivery is interrupted.
      });
    };
  }, [endpoint]);
};
