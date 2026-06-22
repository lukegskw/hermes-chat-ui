import { useEffect } from "react";
import { getApiUrl } from "../config/env";

export const usePresenceHeartbeat = (intervalMs = 30000) => {
  useEffect(() => {
    let intervalId: number | undefined;

    const sendHeartbeat = () => {
      fetch(`${getApiUrl()}/api/push/heartbeat`, {
        method: "POST",
      }).catch(() => {
        // Fail silently - if heartbeat fails, the backend will just default
        // to sending push notifications (fail-safe behavior)
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sendHeartbeat();
        intervalId = window.setInterval(sendHeartbeat, intervalMs);
      } else {
        if (intervalId !== undefined) {
          window.clearInterval(intervalId);
          intervalId = undefined;
        }
      }
    };

    // Initial check
    if (document.visibilityState === "visible") {
      sendHeartbeat();
      intervalId = window.setInterval(sendHeartbeat, intervalMs);
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [intervalMs]);
};
