import React, { useState, useRef, useEffect } from "react";
import {
  Send,
  Square,
  Sparkles,
  Terminal,
  Menu,
  DatabaseZap,
  Paperclip,
  X as XIcon,
  MoreHorizontal,
  Edit2,
  Trash2,
} from "lucide-react";
import MessageBubble from "./MessageBubble";
import {
  ChatMessage,
  PendingApproval,
  Model,
  ConversationAPI,
} from "../utils/api";
import { ApprovalCard } from "./ApprovalCard";
import { validateImageFile, fileToBase64 } from "../utils/imageUtils";
import "./ChatWindow.css";

export interface ChatWindowMessage extends ChatMessage {
  id: string;
  isGenerating?: boolean;
}

export interface ChatWindowProps {
  onToggleSidebar: () => void;
  messages: ChatWindowMessage[];
  activeConversation?: ConversationAPI | null;
  onRenameConversation?: (id: string, newTitle: string) => void;
  onDeleteConversation?: (id: string) => void;
  isGenerating: boolean;
  onSendMessage: (text: string, attachments?: File[]) => void;
  onStopGeneration: () => void;
  selectedModel: string;
  models: Model[];
  onSelectModel: (modelId: string) => void;
  isFetchingModels?: boolean;
  connectionError?: string;
  pendingApproval?: PendingApproval | null;
  onRespondApproval?: (choice: "once" | "session" | "always" | "deny") => void;
}

export default function ChatWindow({
  onToggleSidebar,
  messages,
  activeConversation,
  onRenameConversation,
  onDeleteConversation,
  isGenerating,
  onSendMessage,
  onStopGeneration,
  selectedModel,
  models,
  onSelectModel,
  isFetchingModels,
  connectionError,
  pendingApproval,
  onRespondApproval,
}: ChatWindowProps) {
  const [input, setInput] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

  const handleSaveTitle = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (
      isEditingTitle &&
      editTitleText.trim() &&
      activeConversation &&
      onRenameConversation
    ) {
      onRenameConversation(activeConversation.id, editTitleText.trim());
    }
    setIsEditingTitle(false);
  };

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  // Handle textarea height auto-grow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const addAttachments = async (files: File[]) => {
    const validFiles = files.filter((f) => validateImageFile(f).valid);
    if (validFiles.length === 0) return;

    setPendingAttachments((prev) => [...prev, ...validFiles]);

    for (const file of validFiles) {
      try {
        const dataUrl = await fileToBase64(file);
        setPreviewUrls((prev) => [...prev, dataUrl]);
      } catch (e) {
        console.error("Failed to parse image", e);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addAttachments(Array.from(e.target.files));
    }
  };

  const removeAttachment = (index: number) => {
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() && pendingAttachments.length === 0) return;

    onSendMessage(input.trim(), pendingAttachments);
    setInput("");
    setPendingAttachments([]);
    setPreviewUrls([]);
    setHistoryIndex(-1);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === "ArrowUp") {
      const target = e.target as HTMLTextAreaElement;
      if (
        (target.selectionStart === 0 && target.selectionEnd === 0) ||
        input === ""
      ) {
        e.preventDefault();
        const userMessages = messages.filter((m) => m.role === "user");
        if (userMessages.length > 0) {
          const nextIndex = Math.min(historyIndex + 1, userMessages.length - 1);
          if (nextIndex !== historyIndex) {
            setHistoryIndex(nextIndex);
            const content =
              userMessages[userMessages.length - 1 - nextIndex].content;
            setInput(
              typeof content === "string"
                ? content
                : content
                    .filter((c) => c.type === "text")
                    .map((c) => c.text)
                    .join("\n"),
            );
          }
        }
      }
    } else if (e.key === "ArrowDown") {
      if (historyIndex >= 0) {
        e.preventDefault();
        const userMessages = messages.filter((m) => m.role === "user");
        const nextIndex = historyIndex - 1;
        if (nextIndex === -1) {
          setHistoryIndex(-1);
          setInput("");
        } else {
          setHistoryIndex(nextIndex);
          const content =
            userMessages[userMessages.length - 1 - nextIndex].content;
          setInput(
            typeof content === "string"
              ? content
              : content
                  .filter((c) => c.type === "text")
                  .map((c) => c.text)
                  .join("\n"),
          );
        }
      }
    }
  };

  return (
    <main
      style={{
        flex: 1,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        backgroundColor: "hsl(var(--bg-deep))",
        position: "relative",
        overflow: "hidden",
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragging(false);
        if (e.dataTransfer.files.length > 0) {
          addAttachments(Array.from(e.dataTransfer.files));
        }
      }}
    >
      {/* Global Unified Header Bar */}
      <div className="chat-window-header">
        <div className="header-left">
          <button
            onClick={onToggleSidebar}
            className="mobile-menu-btn"
            title="Menu"
          >
            <Menu size={22} />
          </button>

          {activeConversation ? (
            isEditingTitle ? (
              <form
                onSubmit={handleSaveTitle}
                style={{ flex: 1, display: "flex" }}
              >
                <input
                  ref={titleInputRef}
                  value={editTitleText}
                  onChange={(e) => setEditTitleText(e.target.value)}
                  onBlur={handleSaveTitle}
                  className="header-title-input"
                  placeholder="Nome da conversa..."
                />
              </form>
            ) : (
              <span
                className="header-title"
                onClick={() => {
                  setEditTitleText(activeConversation.title || "");
                  setIsEditingTitle(true);
                }}
              >
                {activeConversation.title || "Conversa sem título"}
              </span>
            )
          ) : (
            <span className="header-title">Hermes Console</span>
          )}
        </div>

        <div className="header-right">
          {activeConversation && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="header-more-btn"
                title="Mais Opções"
              >
                <MoreHorizontal size={20} />
              </button>

              {isMenuOpen && (
                <>
                  <div
                    className="action-menu-backdrop"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <div className="action-menu-dropdown header-dropdown">
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        setEditTitleText(activeConversation.title || "");
                        setIsEditingTitle(true);
                      }}
                      className="action-menu-item"
                    >
                      <Edit2 size={16} /> Renomear
                    </button>
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onSendMessage("/compact");
                      }}
                      className="action-menu-item"
                    >
                      <DatabaseZap size={16} /> Compactar
                    </button>
                    <div
                      style={{
                        height: "1px",
                        backgroundColor: "hsl(var(--border-subtle))",
                        margin: "4px 0",
                      }}
                    />
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (onDeleteConversation) {
                          onDeleteConversation(activeConversation.id);
                        }
                      }}
                      className="action-menu-item delete-item"
                    >
                      <Trash2 size={16} /> Apagar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages View Area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1.5rem 2rem",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {messages.length > 0 ? (
          <div style={{ maxWidth: "850px", width: "100%", margin: "0 auto" }}>
            {messages
              .filter(
                (msg) =>
                  msg.role !== "assistant" ||
                  msg.content ||
                  msg.reasoning_content ||
                  (msg.tool_calls && msg.tool_calls.length > 0) ||
                  msg.isGenerating,
              )
              .map((msg) => {
                let filteredMsg = msg;
                if (
                  msg.role === "assistant" &&
                  typeof msg.content === "string"
                ) {
                  let cleanContent = msg.content;

                  // Handle proper tags or tags missing the opening tag
                  cleanContent = cleanContent
                    .replace(/<TITLE>[\s\S]*?<\/TITLE>\n*/gi, "")
                    .replace(/^[\s\S]*?<\/TITLE>\n*/i, "");

                  // Handle partial stream (missing closing tag)
                  if (cleanContent.includes("<TITLE>")) {
                    cleanContent = cleanContent.replace(/<TITLE>[\s\S]*$/i, "");
                  }

                  filteredMsg = {
                    ...msg,
                    content: cleanContent.trim(),
                  };
                }
                return <MessageBubble key={msg.id} message={filteredMsg} />;
              })}

            <div ref={messagesEndRef} />
          </div>
        ) : (
          /* High-Fidelity Welcome & Suggestions Dashboard */
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              maxWidth: "800px",
              width: "100%",
              margin: "0 auto",
              textAlign: "center",
              padding: "2rem 1rem",
            }}
          >
            {/* Glowing Icon */}
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "24px",
                background:
                  "linear-gradient(135deg, hsl(var(--accent-primary)), hsl(var(--accent-secondary)))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 0 35px hsl(var(--accent-primary) / 0.3)",
                marginBottom: "1.5rem",
                animation: "pulseGlow 4s infinite",
              }}
            >
              <Sparkles size={36} color="white" />
            </div>

            <h2
              style={{
                fontSize: "2rem",
                fontWeight: "800",
                color: "hsl(var(--text-pure))",
                marginBottom: "0.5rem",
                letterSpacing: "-0.7px",
              }}
            >
              Olá! Eu sou o Hermes Agent.
            </h2>
            <p
              style={{
                fontSize: "1rem",
                color: "hsl(var(--text-secondary))",
                maxWidth: "540px",
                marginBottom: "2.5rem",
                lineHeight: 1.5,
              }}
            >
              Como assistente autônomo local, posso rodar comandos, integrar-me
              com sua casa inteligente e realizar buscas avançadas. O que
              faremos hoje?
            </p>
          </div>
        )}
      </div>

      {/* Input controls Container */}
      <div
        style={{
          padding: "0 2rem 2rem 2rem",
          maxWidth: "900px",
          width: "100%",
          margin: "0 auto",
        }}
      >
        {pendingApproval && onRespondApproval && (
          <div style={{ marginBottom: "12px" }}>
            <ApprovalCard
              approval={pendingApproval}
              onRespond={onRespondApproval}
            />
          </div>
        )}

        {previewUrls.length > 0 && (
          <div className="attachment-preview-strip">
            {previewUrls.map((url, i) => (
              <div key={i} className="attachment-thumbnail">
                <img src={url} alt={`Anexo ${i}`} />
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="remove-btn"
                >
                  <XIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form
          onSubmit={handleSubmit}
          className="glass glow-hover"
          style={{
            backgroundColor: "hsl(var(--bg-card) / 0.7)",
            borderRadius: "var(--border-radius-lg)",
            border: "1px solid hsl(var(--border-subtle))",
            padding: "0.6rem 0.8rem",
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {/* Active Model Indicator inside Input Bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              fontSize: "0.68rem",
              fontFamily: "var(--font-mono)",
              color: "hsl(var(--text-secondary))",
              fontWeight: "600",
              padding: "0 4px",
              borderBottom: "1px solid hsl(var(--border-subtle) / 0.4)",
              paddingBottom: "6px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Terminal
                size={11}
                style={{ color: "hsl(var(--accent-primary))" }}
              />
              EXECUTANDO COM:
              <div
                style={{
                  position: "relative",
                  display: "inline-flex",
                  marginLeft: "2px",
                  maxWidth: "calc(100vw - 120px)",
                }}
              >
                <select
                  value={selectedModel}
                  onChange={(e) => onSelectModel(e.target.value)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "hsl(var(--text-secondary))",
                    fontFamily: "var(--font-mono)",
                    fontWeight: "600",
                    fontSize: "0.68rem",
                    outline: "none",
                    cursor: "pointer",
                    width: "auto",
                    maxWidth: "100%",
                    textOverflow: "ellipsis",
                    borderBottom: "1px dashed hsl(var(--border-subtle))",
                    appearance: "none",
                    paddingRight: "14px",
                  }}
                  disabled={models.length === 0}
                >
                  {models.length === 0 && isFetchingModels ? (
                    <option value={selectedModel || ""}>
                      {selectedModel || "Carregando..."}
                    </option>
                  ) : models.length === 0 && connectionError ? (
                    <option value="">
                      {connectionError.substring(0, 30)}...
                    </option>
                  ) : models.length === 0 ? (
                    <option value={selectedModel || ""}>
                      {selectedModel || "Sem modelos"}
                    </option>
                  ) : (
                    models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label || m.id}
                      </option>
                    ))
                  )}
                </select>
                <div
                  style={{
                    position: "absolute",
                    right: "2px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    pointerEvents: "none",
                    color: "hsl(var(--text-secondary))",
                  }}
                >
                  <svg
                    width="8"
                    height="5"
                    viewBox="0 0 10 6"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M1 1L5 5L9 1"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              gap: "8px",
              position: "relative",
            }}
          >
            {isDragging && (
              <div className="drop-zone-active">Solte as imagens aqui</div>
            )}

            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={(e) => {
                if (e.clipboardData.files.length > 0) {
                  addAttachments(Array.from(e.clipboardData.files));
                }
              }}
              placeholder="Envie uma mensagem para o Hermes..."
              style={{
                flex: 1,
                background: "transparent",
                border: "none",
                outline: "none",
                color: "white",
                fontSize: "0.94rem",
                lineHeight: "1.5",
                resize: "none",
                padding: "6px 4px",
                fontFamily: "var(--font-sans)",
                maxHeight: "180px",
              }}
            />

            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                multiple
                accept="image/*"
                onChange={handleFileChange}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "var(--border-radius-md)",
                  backgroundColor: "transparent",
                  border: "none",
                  color: "hsl(var(--text-muted))",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s",
                }}
                className="glow-hover"
                title="Anexar imagem"
              >
                <Paperclip size={18} />
              </button>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--border-radius-md)",
                    backgroundColor: "hsl(0 60% 40% / 0.2)",
                    border: "1px solid hsl(0 60% 40% / 0.4)",
                    color: "hsl(0 80% 60%)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s",
                  }}
                  title="Interromper geração"
                >
                  <Square size={16} fill="hsl(0 80% 60%)" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "var(--border-radius-md)",
                    backgroundColor:
                      input.trim() || pendingAttachments.length > 0
                        ? "hsl(var(--accent-primary))"
                        : "hsl(var(--bg-deep))",
                    border: "none",
                    color:
                      input.trim() || pendingAttachments.length > 0
                        ? "white"
                        : "hsl(var(--text-muted))",
                    cursor:
                      input.trim() || pendingAttachments.length > 0
                        ? "pointer"
                        : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.25s",
                    boxShadow:
                      input.trim() || pendingAttachments.length > 0
                        ? "var(--shadow-glow)"
                        : "none",
                  }}
                  title="Enviar mensagem"
                >
                  <Send size={16} />
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </main>
  );
}
