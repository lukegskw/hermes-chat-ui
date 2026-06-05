import { useState, useRef, useEffect, useCallback } from "react";
import { logger } from "../utils";

export const useClipboard = (resetMs = 1500) => {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const copyToClipboard = useCallback(
    async (text: string) => {
      try {
        if ("clipboard" in navigator && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          // Fallback mechanism for non-secure contexts (HTTP)
          const textArea = document.createElement("textarea");
          textArea.value = text;
          // Move outside of viewport
          textArea.style.position = "absolute";
          textArea.style.left = "-999999px";
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          try {
            document.execCommand("copy");
          } catch (err) {
            logger.error({ error: err }, "Fallback: Oops, unable to copy");
          }
          document.body.removeChild(textArea);
        }

        setCopied(true);
        if (timerRef.current) {
          clearTimeout(timerRef.current);
        }
        timerRef.current = setTimeout(() => setCopied(false), resetMs);
      } catch (err) {
        logger.error({ error: err }, "Failed to copy text");
      }
    },
    [resetMs],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return { copied, copyToClipboard };
};
