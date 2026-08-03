import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { createPortal } from "react-dom";
import {
  Send,
  Mic,
  Square,
  Sparkles,
  Terminal,
  Menu,
  Paperclip,
  X as XIcon,
  MoreHorizontal,
  Edit2,
  Trash2,
} from "../Icons";
import { MessageBubble } from "..";
import { ChatMessage, Model, ConversationAPI } from "../../types";
import {
  appendTranscriptToDraft,
  ImagePreparationError,
  validateImageFile,
  fileToBase64,
} from "../../utils";
import { useVoiceRecorder } from "../../hooks/useVoiceRecorder";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styles from "./ChatWindow.module.scss";
import { decideChatScroll } from "./scrollPolicy";

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
  onSendMessage: (text: string, attachments?: File[]) => Promise<boolean>;
  onStopGeneration: () => void;
  endpoint: string;
  selectedModel: string;
  models: Model[];
  onSelectModel: (modelId: string) => void;
  isFetchingModels?: boolean;
  connectionError?: string;
  isLoadingMessages?: boolean;
  interactionLocked?: boolean;
  onTranscriptionStateChange?: (isTranscribing: boolean) => void;
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
  endpoint,
  selectedModel,
  models,
  onSelectModel,
  isFetchingModels,
  connectionError,
  isLoadingMessages = false,
  interactionLocked = false,
  onTranscriptionStateChange,
}: ChatWindowProps) => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleText, setEditTitleText] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const messagesViewRef = useRef<HTMLDivElement>(null);
  const activeSessionRef = useRef("");
  const pendingInitialScrollRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const wasGeneratingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const transcriptionSessionRef = useRef<string | null>(null);
  const focusTranscriptRef = useRef(false);
  const voice = useVoiceRecorder({
    endpoint,
    disabled: isGenerating || !activeConversation || interactionLocked,
    onTranscript: (text) => {
      if (transcriptionSessionRef.current !== activeConversation?.id) {
        return false;
      }
      setInput((current) => appendTranscriptToDraft(current, text));
      focusTranscriptRef.current = true;
      return true;
    },
  });
  const isInteractionLocked = interactionLocked || voice.isTranscribing;
  const voiceStatusKey =
    (voice.isTranscribing ? null : voice.messageKey) ||
    (voice.isRecording ? "audio.recording" : null) ||
    null;

  const isTouchDevice = useMemo(
    () => window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

  useEffect(() => {
    onTranscriptionStateChange?.(voice.isTranscribing);
    return () => onTranscriptionStateChange?.(false);
  }, [onTranscriptionStateChange, voice.isTranscribing]);

  useEffect(() => {
    if (
      !isInteractionLocked &&
      focusTranscriptRef.current &&
      textareaRef.current
    ) {
      focusTranscriptRef.current = false;
      textareaRef.current.focus();
    }
  }, [isInteractionLocked]);

  const handleSaveTitle = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isInteractionLocked) return;
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

  const activeSessionId = activeConversation?.id ?? "";
  useEffect(() => {
    const viewport = messagesViewRef.current;
    if (!viewport) return;
    const handleScroll = () => {
      const distanceFromBottom =
        viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      isNearBottomRef.current = distanceFromBottom <= 64;
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, []);

  useLayoutEffect(() => {
    const viewport = messagesViewRef.current;
    if (!viewport) return;

    const sessionChanged = activeSessionRef.current !== activeSessionId;
    if (sessionChanged) {
      activeSessionRef.current = activeSessionId;
    }

    const hasPersistedMessages = (activeConversation?.messageCount ?? 0) > 0;
    const waitingForHistory =
      messages.length === 0 && (isLoadingMessages || hasPersistedMessages);
    const decision = decideChatScroll({
      sessionChanged,
      hasActiveSession: Boolean(activeSessionId),
      pendingInitialScroll: pendingInitialScrollRef.current,
      waitingForHistory,
      generationStarted: isGenerating && !wasGeneratingRef.current,
      isGenerating,
      isNearBottom: isNearBottomRef.current,
    });
    pendingInitialScrollRef.current = decision.pendingInitialScroll;
    isNearBottomRef.current = decision.isNearBottom;
    if (decision.scrollToBottom) {
      viewport.scrollTop = viewport.scrollHeight;
    }
    wasGeneratingRef.current = isGenerating;
  }, [
    activeConversation?.messageCount,
    activeSessionId,
    isGenerating,
    isLoadingMessages,
    messages,
  ]);

  // Handle textarea height auto-grow
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [input]);

  const addAttachments = async (files: File[]) => {
    if (isInteractionLocked) return;
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
    if (isInteractionLocked) return;
    if (e.target.files) {
      addAttachments(Array.from(e.target.files));
    }
  };

  const removeAttachment = (index: number) => {
    if (isInteractionLocked) return;
    setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
    setPreviewUrls((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isInteractionLocked) return;
    if (!input.trim() && pendingAttachments.length === 0) return;

    try {
      const accepted = await onSendMessage(input.trim(), pendingAttachments);
      if (!accepted) return;
      setInput("");
      setPendingAttachments([]);
      setPreviewUrls([]);
      setHistoryIndex(-1);
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    } catch (error) {
      const message =
        error instanceof ImagePreparationError
          ? error.code === "image_payload_too_large"
            ? t("errors.imagesTooLarge")
            : t("errors.imageProcessingFailed")
          : t("errors.imageProcessingFailed");
      toast.error(message);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isInteractionLocked) return;
    if (e.key === "Enter" && !e.shiftKey && !isTouchDevice) {
      e.preventDefault();
      void handleSubmit();
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

  const handleStartRecording = () => {
    if (isInteractionLocked) return;
    transcriptionSessionRef.current = activeConversation?.id ?? null;
    setIsMenuOpen(false);
    setIsEditingTitle(false);
    setIsDragging(false);
    void voice.start();
  };

  const handleRetryTranscription = () => {
    if (isInteractionLocked) return;
    setIsMenuOpen(false);
    setIsEditingTitle(false);
    setIsDragging(false);
    voice.retry();
  };

  return (
    <>
      <main
        className={styles.main}
        aria-busy={voice.isTranscribing}
        onDragOver={(e) => {
          e.preventDefault();
          if (isInteractionLocked) return;
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          if (isInteractionLocked) return;
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (isInteractionLocked) return;
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
              onClick={() => {
                if (!isInteractionLocked) onToggleSidebar();
              }}
              className={styles.mobileMenuBtn}
              title="Menu"
              disabled={isInteractionLocked}
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
                    placeholder={t("chat.conversationName")}
                    disabled={isInteractionLocked}
                  />
                </form>
              ) : (
                <span
                  className={styles.headerTitle}
                  onClick={() => {
                    if (isInteractionLocked) return;
                    setEditTitleText(activeConversation.title || "");
                    setIsEditingTitle(true);
                  }}
                >
                  {activeConversation.title || t("common.newChat")}
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
                  onClick={() => {
                    if (!isInteractionLocked) setIsMenuOpen(!isMenuOpen);
                  }}
                  className={styles.headerMoreBtn}
                  title={t("chat.moreOptions")}
                  disabled={isInteractionLocked}
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
                          if (isInteractionLocked) return;
                          setIsMenuOpen(false);
                          setEditTitleText(activeConversation.title || "");
                          setIsEditingTitle(true);
                        }}
                        className={styles.actionMenuItem}
                        disabled={isInteractionLocked}
                      >
                        <Edit2 size={16} /> {t("chat.rename")}
                      </button>
                      <div className={styles.actionMenuDivider} />
                      <button
                        onClick={() => {
                          if (isInteractionLocked) return;
                          setIsMenuOpen(false);
                          if (onDeleteConversation) {
                            onDeleteConversation(activeConversation.id);
                          }
                        }}
                        className={`${styles.actionMenuItem} ${styles.deleteItem}`}
                        disabled={isInteractionLocked}
                      >
                        <Trash2 size={16} /> {t("chat.delete")}
                      </button>
                    </div>

                    {/* Mobile Action Menu (Portal Bottom Sheet) */}
                    {createPortal(
                      <>
                        <div
                          className={styles.actionMenuBackdrop}
                          onClick={() => {
                            if (!isInteractionLocked) setIsMenuOpen(false);
                          }}
                        />
                        <div
                          className={`${styles.actionMenuDropdown} ${styles.mobileMenu}`}
                        >
                          <button
                            onClick={() => {
                              if (isInteractionLocked) return;
                              setIsMenuOpen(false);
                              setEditTitleText(activeConversation.title || "");
                              setIsEditingTitle(true);
                            }}
                            className={styles.actionMenuItem}
                            disabled={isInteractionLocked}
                          >
                            <Edit2 size={16} /> {t("chat.rename")}
                          </button>
                          <div className={styles.actionMenuDivider} />
                          <button
                            onClick={() => {
                              if (isInteractionLocked) return;
                              setIsMenuOpen(false);
                              if (onDeleteConversation) {
                                onDeleteConversation(activeConversation.id);
                              }
                            }}
                            className={`${styles.actionMenuItem} ${styles.deleteItem}`}
                            disabled={isInteractionLocked}
                          >
                            <Trash2 size={16} /> {t("chat.delete")}
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
        {connectionError && (
          <div className={styles.connectionBanner} role="alert">
            {connectionError}
          </div>
        )}
        <div ref={messagesViewRef} className={styles.messagesViewArea}>
          {isLoadingMessages && messages.length === 0 ? (
            <div className={styles.messagesLoading}>{t("chat.loading")}</div>
          ) : messages.length > 0 ? (
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
                      cleanContent = cleanContent.replace(
                        /<TITLE>[\s\S]*$/i,
                        "",
                      );
                    }

                    filteredMsg = {
                      ...msg,
                      content: cleanContent.trim(),
                    };
                  }
                  return <MessageBubble key={msg.id} message={filteredMsg} />;
                })}
            </div>
          ) : (
            /* High-Fidelity Welcome & Suggestions Dashboard */
            <div className={styles.welcomeDashboard}>
              {/* Glowing Icon */}
              <div className={styles.welcomeIconContainer}>
                <Sparkles size={36} color="white" />
              </div>

              <h2 className={styles.welcomeTitle}>{t("chat.welcome.title")}</h2>
              <p className={styles.welcomeSubtitle}>
                {t("chat.welcome.subtitle")}
              </p>
            </div>
          )}
        </div>

        {/* Input controls Container */}
        <div className={styles.inputControlsContainer}>
          {previewUrls.length > 0 && (
            <div className={styles.attachmentPreviewStrip}>
              {previewUrls.map((url, i) => (
                <div key={i} className={styles.attachmentThumbnail}>
                  <img src={url} alt={`${t("messages.attachment")} ${i}`} />
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className={styles.removeBtn}
                    disabled={isInteractionLocked}
                  >
                    <XIcon size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {voiceStatusKey && (
            <div className={styles.voiceStatus} role="status">
              <span>
                {t(voiceStatusKey, {
                  size: Math.ceil(voice.recordedBytes / (1024 * 1024)),
                  maxSize: Math.floor(voice.maxBytes / (1024 * 1024)),
                })}
              </span>
              {voice.canRetry && (
                <button type="button" onClick={handleRetryTranscription}>
                  {t("audio.retry")}
                </button>
              )}
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.chatInputForm}>
            {/* Active Model Indicator inside Input Bar */}
            <div className={styles.modelIndicatorBar}>
              <div className={styles.modelIndicatorContent}>
                <Terminal size={11} className={styles.terminalIcon} />
                {t("chat.runningWith")}
                <div className={styles.modelSelectWrapper}>
                  <select
                    value={selectedModel}
                    onChange={(e) => onSelectModel(e.target.value)}
                    className={styles.modelSelectInput}
                    disabled={isInteractionLocked || models.length === 0}
                  >
                    {models.length === 0 && isFetchingModels ? (
                      <option value={selectedModel || ""}>
                        {selectedModel || t("chat.loading")}
                      </option>
                    ) : models.length === 0 && connectionError ? (
                      <option value="">
                        {connectionError.substring(0, 30)}...
                      </option>
                    ) : models.length === 0 ? (
                      <option value={selectedModel || ""}>
                        {selectedModel || t("chat.noModels")}
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
                <div className={styles.dropZoneActive}>
                  {t("chat.dropImages")}
                </div>
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
                placeholder={t("chat.placeholder")}
                className={styles.chatTextarea}
                disabled={isInteractionLocked}
              />

              <div className={styles.chatActionButtons}>
                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  multiple
                  accept="image/*"
                  onChange={handleFileChange}
                  disabled={isInteractionLocked}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={styles.btnAttach}
                  title={t("chat.attachImage")}
                  disabled={isInteractionLocked}
                >
                  <Paperclip size={18} />
                </button>

                {voice.isAvailable &&
                  (voice.isRecording ? (
                    <>
                      <button
                        type="button"
                        onClick={voice.stop}
                        className={styles.btnVoiceStop}
                        title={t("audio.stopRecording")}
                        disabled={isInteractionLocked}
                      >
                        <Square size={15} fill="currentColor" />
                      </button>
                      <button
                        type="button"
                        onClick={voice.cancel}
                        className={styles.btnVoiceCancel}
                        title={t("audio.cancelRecording")}
                        disabled={isInteractionLocked}
                      >
                        <XIcon size={16} />
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={handleStartRecording}
                      className={styles.btnVoice}
                      disabled={
                        isGenerating ||
                        !activeConversation ||
                        isInteractionLocked
                      }
                      title={t("audio.startRecording")}
                    >
                      <Mic size={18} />
                    </button>
                  ))}

                {isGenerating ? (
                  <button
                    type="button"
                    onClick={onStopGeneration}
                    className={styles.btnStop}
                    title={t("chat.stopGeneration")}
                    disabled={isInteractionLocked}
                  >
                    <Square size={16} fill="currentColor" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={
                      isInteractionLocked ||
                      (!input.trim() && pendingAttachments.length === 0)
                    }
                    className={`${styles.btnSend} ${input.trim() || pendingAttachments.length > 0 ? styles.active : ""}`}
                    title={t("chat.sendMessage")}
                  >
                    <Send size={16} />
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </main>
      {voice.isTranscribing &&
        createPortal(
          <div
            className={styles.transcriptionOverlay}
            role="dialog"
            aria-modal="true"
            aria-labelledby="transcription-status"
          >
            <div className={styles.transcriptionDialog}>
              <div id="transcription-status" role="status" aria-live="polite">
                {t("audio.transcribing")}
              </div>
              <button
                type="button"
                className={styles.transcriptionCancel}
                onClick={voice.cancel}
                autoFocus
              >
                {t("audio.cancelTranscription")}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
};
