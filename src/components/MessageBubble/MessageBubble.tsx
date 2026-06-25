import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AgentActivityLog, ChatWindowMessage, MarkdownRenderer } from "..";
import { linkifyParts } from "../../utils";
import { useClipboard } from "../../hooks";
import {
  Bot,
  BrainCircuit,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Sparkles,
  User,
} from "../Icons";
import styles from "./MessageBubble.module.scss";

export type MessageBubbleProps = {
  message: ChatWindowMessage;
};

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const { t } = useTranslation();
  const { role, content, timestamp } = message;
  const isUser = role === "user";
  const [showReasoning, setShowReasoning] = useState(true);
  const { copied, copyToClipboard } = useClipboard();

  const handleCopy = () => {
    let textContent =
      typeof content === "string"
        ? content
        : content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
    if (!isUser) {
      textContent = textContent.trim();
    }
    void copyToClipboard(textContent);
  };

  const formatTime = (timeStr?: string) => {
    if (!timeStr) return "";
    try {
      const date = new Date(timeStr);
      return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div
      className={`${styles.wrapper} ${isUser ? styles.isUser : styles.isHermes}`}
    >
      {/* Avatar Container */}
      <div className={styles.avatarContainer}>
        {isUser ? (
          <User size={16} className={styles.avatarIcon} />
        ) : (
          <Bot size={16} className={styles.avatarIcon} />
        )}
      </div>

      {/* Bubble Content Card */}
      <div className={styles.content}>
        {/* Role label / Action header */}
        <div className={styles.header}>
          <span className={styles.role}>
            {!isUser && <Sparkles size={10} className={styles.sparklesIcon} />}
            {isUser ? t("messages.you") : t("messages.hermes")}
          </span>

          <div className={styles.actions}>
            <span className={styles.time}>{formatTime(timestamp)}</span>

            <button
              onClick={handleCopy}
              title={t("messages.copyMessage")}
              className={styles.copyBtn}
            >
              {copied ? (
                <Check size={12} className={styles.copyIconSuccess} />
              ) : (
                <Copy size={12} className={styles.copyIcon} />
              )}
            </button>
          </div>
        </div>

        {/* Reasoning and Tools rendering */}
        {!isUser &&
          (message.reasoning_content ||
            (message.tool_calls && message.tool_calls.length > 0)) && (
            <div className={styles.reasoningContainer}>
              <AgentActivityLog
                toolCalls={message.tool_calls}
                reasoningContent={message.reasoning_content}
                isGenerating={message.isGenerating}
              />

              {message.reasoning_content && (
                <div className={styles.reasoningBlock}>
                  <button
                    onClick={() => setShowReasoning(!showReasoning)}
                    className={styles.reasoningToggle}
                  >
                    <BrainCircuit size={15} className={styles.reasoningIcon} />
                    {t("messages.reasoningProcess")}
                    <div className={styles.reasoningChevron}>
                      {showReasoning ? (
                        <ChevronDown size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </div>
                  </button>
                  {showReasoning && (
                    <div className={styles.reasoningContent}>
                      {message.reasoning_content}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        {/* Message body */}
        <div className={styles.body}>
          {isUser ? (
            <div className={styles.bodyUser}>
              {typeof content === "string" ? (
                <span>{linkifyParts([content])}</span>
              ) : (
                <div className={styles.contentParts}>
                  {content.map((part, idx) => {
                    if (part.type === "text") {
                      return <p key={idx}>{linkifyParts([part.text])}</p>;
                    } else {
                      return (
                        <div key={idx} className={styles.imageWrapper}>
                          <img
                            src={part.image_url.url}
                            alt={t("messages.attachment")}
                            className={styles.image}
                          />
                        </div>
                      );
                    }
                  })}
                </div>
              )}
            </div>
          ) : (
            <MarkdownRenderer
              content={(typeof content === "string"
                ? content
                : content
                    .filter((p) => p.type === "text")
                    .map((p) => p.text)
                    .join("\n")
              ).trim()}
            />
          )}
          {!isUser && message.isGenerating && (
            <div className={styles.typingIndicatorContainer}>
              <div className={styles.typingDots}>
                <div className={`${styles.typingDot} ${styles.dot1}`} />
                <div className={`${styles.typingDot} ${styles.dot2}`} />
                <div className={`${styles.typingDot} ${styles.dot3}`} />
              </div>
              <span className={styles.typingText}>
                {t("messages.thinking")}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
