import { useTranslation } from "react-i18next";
import {
  AgentActivityLog,
  ReasoningLog,
  ChatWindowMessage,
  MarkdownRenderer,
} from "..";
import { linkifyParts } from "../../utils";
import { useClipboard } from "../../hooks";
import { Bot, Check, Copy, Sparkles, User } from "../Icons";
import styles from "./MessageBubble.module.scss";
import { ThinkingIndicator } from "../ThinkingIndicator/ThinkingIndicador";
import { ImageLightbox } from "./ImageLightbox";

export type MessageBubbleProps = {
  message: ChatWindowMessage;
};

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const { t } = useTranslation();
  const { role, content, timestamp } = message;
  const isUser = role === "user";
  const { copied, copyToClipboard } = useClipboard();
  const imageUrls =
    typeof content === "string"
      ? []
      : content.flatMap((part) =>
          part.type === "image_url" ? [part.image_url.url] : [],
        );

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
      const isToday = date.toDateString() === new Date().toDateString();
      return date.toLocaleTimeString([], {
        ...(isToday
          ? {}
          : {
              month: "2-digit",
              day: "2-digit",
              year: "numeric",
            }),
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
            (message.tool_calls && message.tool_calls.length > 0) ||
            message.isGenerating) && (
            <div className={styles.reasoningContainer}>
              <AgentActivityLog
                toolCalls={message.tool_calls || []}
                isGenerating={message.isGenerating}
              />

              <ReasoningLog
                reasoningContent={message.reasoning_content}
                isGenerating={message.isGenerating}
              />
            </div>
          )}

        {/* Message body */}
        <div className={styles.body}>
          {isUser ? (
            <div className={styles.bodyUser}>
              {typeof content === "string" ? (
                <span>{linkifyParts([content])}</span>
              ) : (
                content
                  .filter((part) => part.type === "text")
                  .map((part, index) => (
                    <p key={index}>{linkifyParts([part.text])}</p>
                  ))
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

          <ImageLightbox images={imageUrls} />

          <ThinkingIndicator
            label={t("messages.generating")}
            visible={!isUser && !!message.isGenerating}
          />
        </div>
      </div>
    </div>
  );
};
