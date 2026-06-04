import { useState } from "react";
import {
  Copy,
  Check,
  Bot,
  User,
  Sparkles,
  ChevronDown,
  ChevronRight,
  BrainCircuit,
} from "../Icons";
import {
  MarkdownRenderer,
  ChatWindowMessage,
  AgentActivityLog,
  ToolCallBox,
} from "..";
import { ToolCall } from "../../types";
import { logger } from "../../utils";
import styles from "./MessageBubble.module.scss";

export type MessageBubbleProps = {
  message: ChatWindowMessage;
};

export const MessageBubble = ({ message }: MessageBubbleProps) => {
  const { role, content, timestamp } = message;
  const isUser = role === "user";
  const [copied, setCopied] = useState(false);
  const [showReasoning, setShowReasoning] = useState(true);

  const handleCopy = async () => {
    const textContent =
      typeof content === "string"
        ? content
        : content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("\n");
    try {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textContent);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textContent;
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
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      logger.error({ error: err }, "Failed to copy: ");
    }
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
            {isUser ? "Você" : "Hermes"}
          </span>

          <div className={styles.actions}>
            <span className={styles.time}>{formatTime(timestamp)}</span>

            <button
              onClick={handleCopy}
              title="Copiar mensagem"
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
              />

              {message.reasoning_content && (
                <div className={styles.reasoningBlock}>
                  <button
                    onClick={() => setShowReasoning(!showReasoning)}
                    className={styles.reasoningToggle}
                  >
                    <BrainCircuit size={15} className={styles.reasoningIcon} />
                    Processo de Raciocínio
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

              {message.tool_calls &&
                message.tool_calls.map((tc: ToolCall, i: number) => (
                  <ToolCallBox
                    key={i}
                    toolCall={tc}
                    isGenerating={message.isGenerating}
                  />
                ))}
            </div>
          )}

        {/* Inline thinking animation - shown while waiting for first content token */}
        {!isUser && message.isGenerating && !message.content && (
          <div className={styles.typingIndicatorContainer}>
            <div className={styles.typingDots}>
              <div className={`${styles.typingDot} ${styles.dot1}`} />
              <div className={`${styles.typingDot} ${styles.dot2}`} />
              <div className={`${styles.typingDot} ${styles.dot3}`} />
            </div>
            <span className={styles.typingText}>Pensando...</span>
          </div>
        )}

        {/* Message body */}
        <div className={styles.body}>
          {isUser ? (
            <div className={styles.bodyUser}>
              {typeof content === "string" ? (
                <p>{content}</p>
              ) : (
                <div className={styles.contentParts}>
                  {content.map((part, idx) => {
                    if (part.type === "text") {
                      return <p key={idx}>{part.text}</p>;
                    } else {
                      return (
                        <div key={idx} className={styles.imageWrapper}>
                          <img
                            src={part.image_url.url}
                            alt="anexo"
                            className={styles.image}
                          />
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          ) : (
            <MarkdownRenderer
              content={
                typeof content === "string"
                  ? content
                  : content
                      .filter((p) => p.type === "text")
                      .map((p) => p.text)
                      .join("\n")
              }
            />
          )}
        </div>
      </div>
    </div>
  );
};
