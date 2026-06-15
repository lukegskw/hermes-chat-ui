import { useState, useRef, useEffect } from "react";
import {
  sendChatMessageStream,
  compressSession,
  updateConversationTitle,
  createConversation,
  fileToBase64,
  logger,
} from "../utils";
import {
  Conversation,
  ChatMessage,
  PendingApproval,
  ContentPart,
} from "../types";
import i18n from "../i18n";

export const useHermesStream = (
  endpoint: string,
  settings: { systemPrompt?: string },
  conversations: Conversation[],
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
  activeConversationId: string,
  setActiveConversationId: React.Dispatch<React.SetStateAction<string>>,
  selectedModel: string,
  activeMessages: ChatMessage[],
) => {
  const [generatingStates, setGeneratingStates] = useState<
    Record<string, boolean>
  >({});
  const [pendingApproval, setPendingApproval] =
    useState<PendingApproval | null>(null);
  const abortControllersRef = useRef<
    Record<string, AbortController | undefined>
  >({});
  const titleUpdatedRef = useRef<Set<string>>(new Set());

  // --- PWA / Background resilience ---
  // Tracks which conversation was streaming when the page went hidden
  const streamingOnHiddenRef = useRef<string | null>(null);
  // Stores the last text sent per conversation for potential retry
  const lastSentTextRef = useRef<Record<string, string>>({});
  // Stores the last attachments sent per conversation for potential retry
  const lastSentAttachmentsRef = useRef<Record<string, File[]>>({});
  // Flag to prevent duplicate retry
  const retryInProgressRef = useRef(false);

  // Listen for visibility changes to detect PWA backgrounding
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        // Page going to background — record which conversation was streaming
        for (const [convId, isGen] of Object.entries(generatingStates)) {
          if (isGen) {
            streamingOnHiddenRef.current = convId;
            break;
          }
        }
      } else if (document.visibilityState === "visible") {
        // Page returning to foreground — check if we need to retry
        const interruptedConvId = streamingOnHiddenRef.current;
        streamingOnHiddenRef.current = null;

        if (
          interruptedConvId &&
          interruptedConvId === activeConversationId &&
          generatingStates[interruptedConvId] &&
          !retryInProgressRef.current
        ) {
          const lastText = lastSentTextRef.current[interruptedConvId];
          const lastFiles = lastSentAttachmentsRef.current[interruptedConvId];
          if (lastText || (lastFiles && lastFiles.length > 0)) {
            logger.info(
              { convId: interruptedConvId },
              "[PWA] Page returned to foreground, retrying interrupted stream",
            );
            retryInProgressRef.current = true;
            // Small delay to allow the network to stabilize after wake
            setTimeout(() => {
              handleSendMessage(lastText || "", lastFiles).finally(() => {
                retryInProgressRef.current = false;
              });
            }, 500);
          }
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId, generatingStates]);

  const isGenerating = generatingStates[activeConversationId] || false;

  // --- Text-Based Approval Interception ---
  useEffect(() => {
    if (!isGenerating && activeMessages.length > 0) {
      const lastMsg = activeMessages[activeMessages.length - 1];
      if (lastMsg.role === "assistant" && typeof lastMsg.content === "string") {
        const match = lastMsg.content.match(/\[APPROVAL_REQUIRED:\s*(.*?)\]/);
        if (match) {
          const command = match[1].trim();
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setPendingApproval({
            id: `pending_${Date.now()}`,
            tool: "terminal",
            command: command,
            label: command,
          });

          // Strip the ugly tag from the user's view
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id === activeConversationId) {
                const msgs = [...c.messages];
                msgs[msgs.length - 1] = {
                  ...lastMsg,
                  content:
                    (lastMsg.content as string)
                      .replace(/\[APPROVAL_REQUIRED:\s*(.*?)\]/g, "")
                      .trim() || i18n.t("errors.approvalRequired"),
                };
                return { ...c, messages: msgs };
              }
              return c;
            }),
          );
        }
      }
    }
  }, [activeMessages, isGenerating, activeConversationId, setConversations]);

  const handleCleanupConversation = (id: string) => {
    setGeneratingStates((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    abortControllersRef.current[id]?.abort();
    delete abortControllersRef.current[id];
    delete lastSentTextRef.current[id];
    delete lastSentAttachmentsRef.current[id];
  };

  const handleCleanupAllConversations = () => {
    setGeneratingStates({});
    for (const id of Object.keys(abortControllersRef.current)) {
      abortControllersRef.current[id]?.abort();
    }
    abortControllersRef.current = {};
    lastSentTextRef.current = {};
    lastSentAttachmentsRef.current = {};
  };

  const handleRespondApproval = async (
    choice: "once" | "session" | "always" | "deny",
  ) => {
    setPendingApproval(null);
    if (choice === "deny") {
      await handleSendMessage(i18n.t("errors.approvalDenied"));
    } else {
      await handleSendMessage(i18n.t("errors.approvalGranted"));
    }
  };

  const handleSendMessage = async (text: string, attachments?: File[]) => {
    if (
      (!text.trim() && (!attachments || attachments.length === 0)) ||
      isGenerating
    )
      return;

    let convId = activeConversationId;
    let currentConversations = [...conversations];

    // Store last sent message for PWA retry
    lastSentTextRef.current[convId] = text;
    if (attachments) {
      lastSentAttachmentsRef.current[convId] = attachments;
    }

    // 1. Create a conversation if none exists
    if (!convId || !currentConversations.find((c) => c.id === convId)) {
      convId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const newConv: Conversation = {
        id: convId,
        title: text.substring(0, 30) + (text.length > 30 ? "..." : ""),
        messages: [],
        modelId: selectedModel,
      };
      currentConversations = [newConv, ...currentConversations];
      setConversations(currentConversations);
      setActiveConversationId(convId);

      createConversation(endpoint, newConv).catch(console.error);
    }

    // Re-bind refs after potential convId change
    lastSentTextRef.current[convId] = text;
    if (attachments) {
      lastSentAttachmentsRef.current[convId] = attachments;
    }

    const targetConv = currentConversations.find((c) => c.id === convId);
    const existingMessages = targetConv ? targetConv.messages : [];

    // Intercept /compact and /compress commands
    const command = text.trim();
    if (command === "/compact" || command === "/compress") {
      const userMsg: ChatMessage = {
        id: `msg_${Date.now()}`,
        role: "user",
        content: command,
      };
      const systemMsg: ChatMessage = {
        id: `msg_${Date.now() + 1}`,
        role: "system",
        content: i18n.t("errors.compressingContext"),
      };

      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? { ...c, messages: [...existingMessages, userMsg, systemMsg] }
            : c,
        ),
      );

      setGeneratingStates((prev) => ({ ...prev, [convId]: true }));
      const success = await compressSession(endpoint);
      setGeneratingStates((prev) => ({ ...prev, [convId]: false }));

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === convId) {
            const msgs = [...c.messages];
            msgs[msgs.length - 1] = {
              ...msgs[msgs.length - 1],
              content: success
                ? i18n.t("errors.compressSuccess")
                : i18n.t("errors.compressFailed"),
            };
            return { ...c, messages: msgs };
          }
          return c;
        }),
      );
      return;
    }

    // 2. Add user message
    let messageContent: string | ContentPart[] = text;

    if (attachments && attachments.length > 0) {
      const contentParts: ContentPart[] = [];
      if (text) {
        contentParts.push({ type: "text", text });
      }
      for (const file of attachments) {
        try {
          const base64Data = await fileToBase64(file);
          contentParts.push({
            type: "image_url",
            image_url: { url: base64Data },
          });
        } catch (e) {
          logger.error({ error: e }, "Failed to convert image to base64");
        }
      }
      messageContent = contentParts;
    }

    const userMsg: ChatMessage = {
      id: `msg_${Date.now()}`,
      role: "user",
      content: messageContent,
    };

    const updatedMessages = [...existingMessages, userMsg];

    let title = targetConv ? targetConv.title : "Nova Conversa";
    if (title === "Nova Conversa") {
      title = text.substring(0, 30) + (text.length > 30 ? "..." : "");
    }

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === convId) {
          return { ...c, title, messages: updatedMessages };
        }
        return c;
      }),
    );

    // 3. Prepare empty assistant message for streaming
    const assistantMsgId = `msg_${Date.now() + 1}`;
    const assistantMsg: ChatMessage = {
      id: assistantMsgId,
      role: "assistant",
      content: "",
      isGenerating: true,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id === convId) {
          return { ...c, messages: [...updatedMessages, assistantMsg] };
        }
        return c;
      }),
    );

    // 4. Fire API call with abort controller
    setGeneratingStates((prev) => ({ ...prev, [convId]: true }));
    const controller = new AbortController();
    abortControllersRef.current[convId] = controller;

    const actualModel = targetConv?.modelId || selectedModel;

    let promptToUse = (settings.systemPrompt || "").trim();
    promptToUse += i18n.t("systemPrompts.criticalInstruction");
    if (existingMessages.length === 0) {
      titleUpdatedRef.current.delete(convId);
      promptToUse +=
        "\n[CRITICAL INSTRUCTION: This is the first message. You MUST begin your response exactly with the tag <TITLE> followed by a concise 3-5 word title for this chat, followed by </TITLE> and a line break, and then provide your normal response.]";
    }

    let assistantMessageContent = "";

    await sendChatMessageStream({
      endpoint,
      model: actualModel,
      messages: updatedMessages,
      systemPrompt: promptToUse,
      conversationId: convId,
      signal: controller.signal,
      onChunk: (chunk) => {
        assistantMessageContent += chunk;

        if (!titleUpdatedRef.current.has(convId)) {
          const match = assistantMessageContent.match(
            /<TITLE>([\s\S]*?)<\/TITLE>/,
          );
          if (match) {
            const extractedTitle = match[1].trim();
            titleUpdatedRef.current.add(convId);
            setConversations((prev) =>
              prev.map((c) =>
                c.id === convId ? { ...c, title: extractedTitle } : c,
              ),
            );
            updateConversationTitle(endpoint, convId, extractedTitle).catch(
              console.error,
            );
          }
        }

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === convId) {
              const newMessages = c.messages.map((m) => {
                if (m.id === assistantMsgId) {
                  return { ...m, content: m.content + chunk };
                }
                return m;
              });
              return { ...c, messages: newMessages };
            }
            return c;
          }),
        );
      },
      onReasoningChunk: (chunk) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === convId) {
              return {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id === assistantMsgId) {
                    return {
                      ...m,
                      reasoning_content: (m.reasoning_content || "") + chunk,
                    };
                  }
                  return m;
                }),
              };
            }
            return c;
          }),
        );
      },
      onToolCallChunk: (tcDelta: unknown) => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === convId) {
              return {
                ...c,
                messages: c.messages.map((m) => {
                  if (m.id === assistantMsgId) {
                    const currentTools = [...(m.tool_calls || [])];
                    const delta = tcDelta as {
                      index?: number;
                      id: string;
                      type: string;
                      function?: { name?: string; arguments?: string };
                      status?: "running" | "completed" | "error";
                    };
                    const index = delta.index || 0;
                    if (!currentTools[index]) {
                      currentTools[index] = {
                        id: delta.id,
                        type: delta.type,
                        function: {
                          name: delta.function?.name || "",
                          arguments: delta.function?.arguments || "",
                        },
                        status: delta.status || "running",
                      };
                    } else {
                      if (delta.function?.arguments) {
                        currentTools[index].function.arguments +=
                          delta.function.arguments;
                      }
                      if (delta.status) {
                        currentTools[index].status = delta.status;
                      }
                    }
                    return { ...m, tool_calls: currentTools };
                  }
                  return m;
                }),
              };
            }
            return c;
          }),
        );
      },
      onDone: () => {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === convId) {
              return {
                ...c,
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        isGenerating: false,
                        content:
                          typeof m.content === "string"
                            ? m.content
                                .replace(/<TITLE>[\s\S]*?<\/TITLE>\n*/gi, "")
                                .replace(/^[\s\S]*?<\/TITLE>\n*/i, "")
                                .trim()
                            : m.content,
                      }
                    : m,
                ),
              };
            }
            return c;
          }),
        );
        setGeneratingStates((prev) => ({ ...prev, [convId]: false }));
        delete abortControllersRef.current[convId];
        delete lastSentTextRef.current[convId];
        delete lastSentAttachmentsRef.current[convId];
      },
      onError: (err) => {
        logger.error({ error: err }, "Streaming connection error");
        // Check if the error happened while the page was hidden (PWA backgrounded)
        // If so, the message will be retried on visibilitychange — skip appending error
        const wasBackgrounded = streamingOnHiddenRef.current === convId;

        if (!wasBackgrounded) {
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id === convId) {
                return {
                  ...c,
                  messages: c.messages.map((m) => {
                    if (m.id === assistantMsgId) {
                      return {
                        ...m,
                        isGenerating: false,
                        content:
                          m.content +
                          `\n\n` +
                          i18n.t("errors.connectionError", {
                            message: err.message,
                          }),
                      };
                    }
                    return m;
                  }),
                };
              }
              return c;
            }),
          );
        }

        setGeneratingStates((prev) => ({ ...prev, [convId]: false }));
        delete abortControllersRef.current[convId];
        // Keep lastSentTextRef so retry can pick it up
      },
    });
  };

  const handleStopGeneration = () => {
    const controller = abortControllersRef.current[activeConversationId];
    if (controller) {
      controller.abort();

      // Explicitly tell backend to kill the task
      fetch(
        `${endpoint.replace(/\/$/, "")}/api/chat/${activeConversationId}/cancel`,
        {
          method: "POST",
        },
      ).catch((err) => console.error("Failed to cancel on backend:", err));

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConversationId) {
            return {
              ...c,
              messages: c.messages.map((m) =>
                m.isGenerating ? { ...m, isGenerating: false } : m,
              ),
            };
          }
          return c;
        }),
      );
      setGeneratingStates((prev) => ({
        ...prev,
        [activeConversationId]: false,
      }));
      delete lastSentTextRef.current[activeConversationId];
      delete lastSentAttachmentsRef.current[activeConversationId];
    }
  };

  return {
    isGenerating,
    pendingApproval,
    handleSendMessage,
    handleStopGeneration,
    handleRespondApproval,
    handleCleanupConversation,
    handleCleanupAllConversations,
  };
};
