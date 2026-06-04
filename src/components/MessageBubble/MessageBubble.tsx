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
import "./MessageBubble.css";

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
      className={`animate-fade message-bubble-wrapper ${isUser ? "is-user" : "is-hermes"}`}
    >
      {/* Avatar Container */}
      <div className="avatar-container">
        {isUser ? (
          <User size={16} className="avatar-icon-user" />
        ) : (
          <Bot size={16} className="avatar-icon-hermes" />
        )}
      </div>

      {/* Bubble Content Card */}
      <div className="bubble-content">
        {/* Role label / Action header */}
        <div className="bubble-header">
          <span className="bubble-role">
            {!isUser && <Sparkles size={10} className="sparkles-icon" />}
            {isUser ? "Você" : "Hermes"}
          </span>

          <div className="bubble-actions">
            <span className="bubble-time">{formatTime(timestamp)}</span>

            <button
              onClick={handleCopy}
              title="Copiar mensagem"
              className="msg-copy-btn"
            >
              {copied ? (
                <Check size={12} className="copy-icon-success" />
              ) : (
                <Copy size={12} className="copy-icon" />
              )}
            </button>
          </div>
        </div>

        {/* Reasoning and Tools rendering */}
        {!isUser &&
          (message.reasoning_content ||
            (message.tool_calls && message.tool_calls.length > 0)) && (
            <div className="reasoning-container">
              <AgentActivityLog
                toolCalls={message.tool_calls}
                reasoningContent={message.reasoning_content}
              />

              {message.reasoning_content && (
                <div className="reasoning-block">
                  <button
                    onClick={() => setShowReasoning(!showReasoning)}
                    className="reasoning-toggle"
                  >
                    <BrainCircuit size={15} className="reasoning-icon" />
                    Processo de Raciocínio
                    <div className="reasoning-chevron">
                      {showReasoning ? (
                        <ChevronDown size={15} />
                      ) : (
                        <ChevronRight size={15} />
                      )}
                    </div>
                  </button>
                  {showReasoning && (
                    <div className="reasoning-content">
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
          <div className="typing-indicator-container">
            <div className="typing-dots">
              <div className="typing-dot dot-1" />
              <div className="typing-dot dot-2" />
              <div className="typing-dot dot-3" />
            </div>
            <span className="typing-text">Pensando...</span>
          </div>
        )}

        {/* Message body */}
        <div className="bubble-body">
          {isUser ? (
            <div className="bubble-body-user">
              {typeof content === "string" ? (
                <p>{content}</p>
              ) : (
                <div className="bubble-content-parts">
                  {content.map((part, idx) => {
                    if (part.type === "text") {
                      return <p key={idx}>{part.text}</p>;
                    } else {
                      return (
                        <div key={idx} className="bubble-image-wrapper">
                          <img
                            src={part.image_url.url}
                            alt="anexo"
                            className="bubble-image"
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
