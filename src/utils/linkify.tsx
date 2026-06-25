import React from "react";
import styles from "../components/MarkdownRenderer/MarkdownRenderer.module.scss";

export const linkifyParts = (parts: React.ReactNode[]): React.ReactNode[] => {
  const result: React.ReactNode[] = [];
  const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/g;

  parts.forEach((part, index) => {
    if (typeof part === "string") {
      const split = part.split(urlRegex);
      split.forEach((text, i) => {
        if (text.match(urlRegex)) {
          result.push(
            <a
              key={`auto-link-${index}-${i}`}
              href={text}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              {text}
            </a>,
          );
        } else if (text) {
          result.push(text);
        }
      });
    } else {
      result.push(part);
    }
  });

  return result;
};
