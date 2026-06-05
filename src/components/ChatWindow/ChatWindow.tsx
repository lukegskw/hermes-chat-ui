import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
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
} from "../Icons";
import { MessageBubble, ApprovalCard } from "..";
import {
  ChatMessage,
  PendingApproval,
  Model,
  ConversationAPI,
} from "../../types";
import { validateImageFile, fileToBase64 } from "../../utils";
import styles from "./ChatWindow.module.scss";

export type ChatWindowMessage = ChatMessage & {
  id: string;
  isGenerating?: boolean;
};

export type ChatWindowProps = {
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
};

export const ChatWindow = ({
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
}: ChatWindowProps) => {
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
      className={styles.main}
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
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <button
            onClick={onToggleSidebar}
            className={styles.mobileMenuBtn}
            title="Menu"
          >
            <Menu size={22} />
          </button>

          {activeConversation ? (
            isEditingTitle ? (
              <form
                onSubmit={handleSaveTitle}
                className={styles.headerTitleForm}
              >
                <input
                  ref={titleInputRef}
                  value={editTitleText}
                  onChange={(e) => setEditTitleText(e.target.value)}
                  onBlur={handleSaveTitle}
                  className={styles.headerTitleInput}
                  placeholder="Nome da conversa..."
                />
              </form>
            ) : (
              <span
                className={styles.headerTitle}
                onClick={() => {
                  setEditTitleText(activeConversation.title || "");
                  setIsEditingTitle(true);
                }}
              >
                {activeConversation.title || "Conversa sem título"}
              </span>
            )
          ) : (
            <span className={styles.headerTitle}>Hermes Chat</span>
          )}
        </div>

        <div className={styles.headerRight}>
          {activeConversation && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className={styles.headerMoreBtn}
                title="Mais Opções"
              >
                <MoreHorizontal size={20} />
              </button>

              {isMenuOpen && (
                <>
                  {/* Desktop Action Menu (Inline) */}
                  <div
                    className={`${styles.actionMenuDropdown} ${styles.desktopMenu}`}
                  >
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        setEditTitleText(activeConversation.title || "");
                        setIsEditingTitle(true);
                      }}
                      className={styles.actionMenuItem}
                    >
                      <Edit2 size={16} /> Renomear
                    </button>
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        onSendMessage("/compact");
                      }}
                      className={styles.actionMenuItem}
                    >
                      <DatabaseZap size={16} /> Compactar
                    </button>
                    <div className={styles.actionMenuDivider} />
                    <button
                      onClick={() => {
                        setIsMenuOpen(false);
                        if (onDeleteConversation) {
                          onDeleteConversation(activeConversation.id);
                        }
                      }}
                      className={`${styles.actionMenuItem} ${styles.deleteItem}`}
                    >
                      <Trash2 size={16} /> Apagar
                    </button>
                  </div>

                  {/* Mobile Action Menu (Portal Bottom Sheet) */}
                  {createPortal(
                    <>
                      <div
                        className={styles.actionMenuBackdrop}
                        onClick={() => setIsMenuOpen(false)}
                      />
                      <div
                        className={`${styles.actionMenuDropdown} ${styles.mobileMenu}`}
                      >
                        <button
                          onClick={() => {
                            setIsMenuOpen(false);
                            setEditTitleText(activeConversation.title || "");
                            setIsEditingTitle(true);
                          }}
                          className={styles.actionMenuItem}
                        >
                          <Edit2 size={16} /> Renomear
                        </button>
                        <button
                          onClick={() => {
                            setIsMenuOpen(false);
                            onSendMessage("/compact");
                          }}
                          className={styles.actionMenuItem}
                        >
                          <DatabaseZap size={16} /> Compactar
                        </button>
                        <div className={styles.actionMenuDivider} />
                        <button
                          onClick={() => {
                            setIsMenuOpen(false);
                            if (onDeleteConversation) {
                              onDeleteConversation(activeConversation.id);
                            }
                          }}
                          className={`${styles.actionMenuItem} ${styles.deleteItem}`}
                        >
                          <Trash2 size={16} /> Apagar
                        </button>
                      </div>
                    </>,
                    document.body,
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Messages View Area */}
      <div className={styles.messagesViewArea}>
        {messages.length > 0 ? (
          <div className={styles.messagesContainer}>
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
          <div className={styles.welcomeDashboard}>
            {/* Glowing Icon */}
            <div className={styles.welcomeIconContainer}>
              <Sparkles size={36} color="white" />
            </div>

            <h2 className={styles.welcomeTitle}>Olá! Eu sou o Hermes Agent.</h2>
            <p className={styles.welcomeSubtitle}>
              Como assistente autônomo local, posso rodar comandos, integrar-me
              com sua casa inteligente e realizar buscas avançadas. O que
              faremos hoje?
            </p>
          </div>
        )}
      </div>

      {/* Input controls Container */}
      <div className={styles.inputControlsContainer}>
        {pendingApproval && onRespondApproval && (
          <div className={styles.approvalCardWrapper}>
            <ApprovalCard
              approval={pendingApproval}
              onRespond={onRespondApproval}
            />
          </div>
        )}

        {previewUrls.length > 0 && (
          <div className={styles.attachmentPreviewStrip}>
            {previewUrls.map((url, i) => (
              <div key={i} className={styles.attachmentThumbnail}>
                <img src={url} alt={`Anexo ${i}`} />
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className={styles.removeBtn}
                >
                  <XIcon size={12} />
                </button>
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className={styles.chatInputForm}>
          {/* Active Model Indicator inside Input Bar */}
          <div className={styles.modelIndicatorBar}>
            <div className={styles.modelIndicatorContent}>
              <Terminal size={11} className={styles.terminalIcon} />
              EXECUTANDO COM:
              <div className={styles.modelSelectWrapper}>
                <select
                  value={selectedModel}
                  onChange={(e) => onSelectModel(e.target.value)}
                  className={styles.modelSelectInput}
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
                <div className={styles.modelSelectArrow}>
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

          <div className={styles.chatInputActions}>
            {isDragging && (
              <div className={styles.dropZoneActive}>Solte as imagens aqui</div>
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
              className={styles.chatTextarea}
            />

            <div className={styles.chatActionButtons}>
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
                className={styles.btnAttach}
                title="Anexar imagem"
              >
                <Paperclip size={18} />
              </button>

              {isGenerating ? (
                <button
                  type="button"
                  onClick={onStopGeneration}
                  className={styles.btnStop}
                  title="Interromper geração"
                >
                  <Square size={16} fill="currentColor" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className={`${styles.btnSend} ${input.trim() || pendingAttachments.length > 0 ? styles.active : ""}`}
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
};
