import React, {
  useState,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from "react";
import { Send, Square, Sparkles, Menu, Paperclip, X as XIcon } from "../Icons";
import { MessageBubble } from "..";
import { ConversationActionMenu } from "../ConversationActionMenu";
import type {
  SelectFieldGroup,
  SelectFieldItem,
  SelectFieldOption,
} from "../SelectField";
import { ChatMessage, ConversationAPI } from "../../types";
import {
  ImagePreparationError,
  validateImageFile,
  fileToBase64,
} from "../../utils";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import styles from "./ChatWindow.module.scss";
import {
  decideChatScroll,
  isWaitingForInitialHistory,
  restorePrependScrollTop,
} from "./scrollPolicy";

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
  selectedModel: string;
  modelOptionGroups: SelectFieldGroup[];
  conversationModelValue: string;
  reasoningEffort?: string | null;
  reasoningSupported?: boolean;
  reasoningEfforts: string[];
  unconfirmedReasoningEfforts?: string[];
  defaultReasoning: string;
  onSelectModel: (modelId: string) => Promise<boolean>;
  onSelectReasoningEffort?: (reasoningEffort: string) => Promise<boolean>;
  isFetchingModels?: boolean;
  isUpdatingRuntime?: boolean;
  connectionError?: string;
  isLoadingMessages?: boolean;
  isLoadingOlderMessages?: boolean;
  hasOlderMessages?: boolean;
  messageLoadError?: string;
  onLoadOlderMessages?: () => Promise<void>;
  onRetryMessages?: () => void;
  interactionLocked?: boolean;
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
  modelOptionGroups,
  conversationModelValue,
  reasoningEffort,
  reasoningSupported = true,
  reasoningEfforts,
  unconfirmedReasoningEfforts = [],
  defaultReasoning,
  onSelectModel,
  onSelectReasoningEffort,
  isFetchingModels,
  isUpdatingRuntime = false,
  connectionError,
  isLoadingMessages = false,
  isLoadingOlderMessages = false,
  hasOlderMessages = false,
  messageLoadError = "",
  onLoadOlderMessages,
  onRetryMessages,
  interactionLocked = false,
}: ChatWindowProps) => {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
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
  const prependAnchorRef = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const isInteractionLocked = interactionLocked;
  const reasoningAvailable = reasoningSupported && reasoningEfforts.length > 0;
  const defaultReasoningLabel =
    defaultReasoning === "provider"
      ? t("chat.providerDefault")
      : defaultReasoning === "none"
        ? t("chat.hermesDefaultDisabled")
        : t("chat.hermesDefaultEffort", { effort: defaultReasoning });
  const reasoningOptions: SelectFieldOption[] = reasoningAvailable
    ? [
        { value: "", label: defaultReasoningLabel },
        ...reasoningEfforts.map((effort) => ({
          value: effort,
          label: unconfirmedReasoningEfforts.includes(effort)
            ? t("chat.reasoningCompatibilityDependent", { effort })
            : effort,
        })),
      ]
    : [
        {
          value: "",
          label: reasoningSupported
            ? t("chat.reasoningUnavailable")
            : t("chat.reasoningUnsupported"),
        },
      ];
  const conversationModelOptions: SelectFieldItem[] =
    modelOptionGroups.length > 0
      ? conversationModelValue
        ? modelOptionGroups
        : [
            {
              value: "",
              label: t("chat.selectModelProvider"),
              disabled: true,
            },
            ...modelOptionGroups,
          ]
      : isFetchingModels
        ? [{ value: conversationModelValue, label: t("chat.loading") }]
        : connectionError
          ? [{ value: "", label: `${connectionError.substring(0, 30)}...` }]
          : [{ value: conversationModelValue, label: t("chat.noModels") }];

  const isTouchDevice = useMemo(
    () => window.matchMedia("(pointer: coarse)").matches,
    [],
  );

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
    }
  }, [isEditingTitle]);

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
      isNearBottomRef.current =
        distanceFromBottom <= Math.max(150, viewport.clientHeight * 0.15);
      if (
        viewport.scrollTop <= 80 &&
        hasOlderMessages &&
        !isLoadingOlderMessages &&
        !isGenerating &&
        onLoadOlderMessages
      ) {
        prependAnchorRef.current = {
          scrollHeight: viewport.scrollHeight,
          scrollTop: viewport.scrollTop,
        };
        void onLoadOlderMessages();
      }
    };
    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [
    hasOlderMessages,
    isGenerating,
    isLoadingOlderMessages,
    onLoadOlderMessages,
  ]);

  useLayoutEffect(() => {
    const viewport = messagesViewRef.current;
    const anchor = prependAnchorRef.current;
    if (!viewport || !anchor || isLoadingOlderMessages) return;
    viewport.scrollTop = restorePrependScrollTop(
      anchor.scrollTop,
      anchor.scrollHeight,
      viewport.scrollHeight,
    );
    prependAnchorRef.current = null;
  }, [isLoadingOlderMessages, messages]);

  useLayoutEffect(() => {
    const viewport = messagesViewRef.current;
    if (!viewport) return;

    const sessionChanged = activeSessionRef.current !== activeSessionId;
    if (sessionChanged) {
      activeSessionRef.current = activeSessionId;
    }

    const waitingForHistory = isWaitingForInitialHistory({
      sessionChanged,
      isLoadingMessages,
      historyLoaded: Boolean(activeConversation?.historyLoaded),
    });
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

    let resizeObserver: ResizeObserver | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    if (decision.scrollToBottom) {
      viewport.scrollTop = viewport.scrollHeight;

      // Observe the content container for height changes (e.g. images loading, syntax highlighting)
      const contentContainer = viewport.firstElementChild;
      if (contentContainer) {
        resizeObserver = new ResizeObserver(() => {
          viewport.scrollTop = viewport.scrollHeight;
        });
        resizeObserver.observe(contentContainer);

        timeoutId = setTimeout(() => {
          if (resizeObserver) resizeObserver.disconnect();
        }, 1500);
      }
    }
    wasGeneratingRef.current = isGenerating;

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    activeConversation?.historyLoaded,
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

  return (
    <>
      <main
        className={styles.main}
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
              <ConversationActionMenu
                key={activeConversation.id}
                conversationTitle={
                  activeConversation.title || t("common.newChat")
                }
                modelLabel={selectedModel || t("chat.noModels")}
                modelValue={conversationModelValue}
                modelOptions={conversationModelOptions}
                modelDisabled={modelOptionGroups.length === 0}
                reasoningLabel={
                  reasoningAvailable
                    ? reasoningEffort || defaultReasoningLabel
                    : reasoningOptions[0].label
                }
                reasoningValue={reasoningAvailable ? reasoningEffort || "" : ""}
                reasoningOptions={reasoningOptions}
                reasoningDisabled={!selectedModel || !reasoningAvailable}
                busy={isUpdatingRuntime}
                disabled={isInteractionLocked}
                onSelectModel={onSelectModel}
                onSelectReasoning={async (value) =>
                  (await onSelectReasoningEffort?.(value)) ?? false
                }
                onRename={() => {
                  if (isInteractionLocked) return;
                  setEditTitleText(activeConversation.title || "");
                  setIsEditingTitle(true);
                }}
                onDelete={() => {
                  if (isInteractionLocked) return;
                  onDeleteConversation?.(activeConversation.id);
                }}
              />
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
          {isLoadingMessages ? (
            <div className={styles.messagesSkeleton} role="status">
              <span className={styles.visuallyHidden}>{t("chat.loading")}</span>
              {Array.from({ length: 6 }, (_, index) => (
                <div
                  key={index}
                  className={`${styles.skeletonMessage} ${index % 2 === 0 ? styles.skeletonUser : ""}`}
                >
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : messageLoadError && messages.length === 0 ? (
            <div className={styles.historyError} role="alert">
              <span>{messageLoadError}</span>
              <button type="button" onClick={onRetryMessages}>
                {t("chat.retryHistory")}
              </button>
            </div>
          ) : messages.length > 0 ? (
            <div className={styles.messagesContainer}>
              {(hasOlderMessages || isLoadingOlderMessages) && (
                <div className={styles.olderMessagesStatus} role="status">
                  {isLoadingOlderMessages
                    ? t("chat.loadingOlder")
                    : t("chat.scrollForOlder")}
                </div>
              )}
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

          <form onSubmit={handleSubmit} className={styles.chatInputForm}>
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
    </>
  );
};
