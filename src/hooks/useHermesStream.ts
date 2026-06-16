import { useEffect, useRef, useState } from "react";
import i18n from "../i18n";
import {
  ChatMessage,
  ContentPart,
  Conversation,
  PendingApproval,
} from "../types";
import {
  compressSession,
  createConversation,
  fileToBase64,
  logger,
  sendChatMessageStream,
  updateConversationTitle,
} from "../utils";

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
  };

  const handleCleanupAllConversations = () => {
    setGeneratingStates({});
    for (const id of Object.keys(abortControllersRef.current)) {
      abortControllersRef.current[id]?.abort();
    }
    abortControllersRef.current = {};
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

    const targetConv = conversations.find((c) => c.id === activeConversationId);
    const existingMessages = targetConv ? targetConv.messages : [];

    // If this is the first message, the conversation doesn't exist in the backend yet.
    // Create it now with the proper title so the chat_completions INSERT OR IGNORE is a no-op.
    if (existingMessages.length === 0) {
      const initialTitle =
        text.substring(0, 30) + (text.length > 30 ? "..." : "");
      await createConversation(endpoint, {
        id: activeConversationId,
        title: initialTitle,
        messages: [],
        modelId: targetConv?.modelId || selectedModel,
      });
    }

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
          c.id === activeConversationId
            ? { ...c, messages: [...existingMessages, userMsg, systemMsg] }
            : c,
        ),
      );

      setGeneratingStates((prev) => ({
        ...prev,
        [activeConversationId]: true,
      }));
      const success = await compressSession(endpoint);
      setGeneratingStates((prev) => ({
        ...prev,
        [activeConversationId]: false,
      }));

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id === activeConversationId) {
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
        if (c.id === activeConversationId) {
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
        if (c.id === activeConversationId) {
          return { ...c, messages: [...updatedMessages, assistantMsg] };
        }
        return c;
      }),
    );

    // 4. Fire API call with abort controller
    setGeneratingStates((prev) => ({ ...prev, [activeConversationId]: true }));
    const controller = new AbortController();
    abortControllersRef.current[activeConversationId] = controller;

    const actualModel = targetConv?.modelId || selectedModel;

    let promptToUse = (settings.systemPrompt || "").trim();
    promptToUse += i18n.t("systemPrompts.criticalInstruction");
    if (existingMessages.length === 0) {
      titleUpdatedRef.current.delete(activeConversationId);
      promptToUse +=
        "\n[CRITICAL INSTRUCTION: This is the first message. You MUST begin your response exactly with the tag <TITLE> followed by a concise 3-5 word title for this chat, followed by </TITLE> and a line break, and then provide your normal response.]";
    }

    let assistantMessageContent = "";

    await sendChatMessageStream({
      endpoint,
      model: actualModel,
      messages: updatedMessages,
      systemPrompt: promptToUse,
      conversationId: activeConversationId,
      signal: controller.signal,
      onChunk: (chunk) => {
        assistantMessageContent += chunk;

        if (!titleUpdatedRef.current.has(activeConversationId)) {
          const match = assistantMessageContent.match(
            /<TITLE>([\s\S]*?)<\/TITLE>/,
          );
          if (match) {
            const extractedTitle = match[1].trim();
            titleUpdatedRef.current.add(activeConversationId);
            setConversations((prev) =>
              prev.map((c) =>
                c.id === activeConversationId
                  ? { ...c, title: extractedTitle }
                  : c,
              ),
            );
            updateConversationTitle(
              endpoint,
              activeConversationId,
              extractedTitle,
            ).catch(console.error);
          }
        }

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === activeConversationId) {
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
            if (c.id === activeConversationId) {
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
            if (c.id === activeConversationId) {
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
            if (c.id === activeConversationId) {
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
        setGeneratingStates((prev) => ({
          ...prev,
          [activeConversationId]: false,
        }));
        delete abortControllersRef.current[activeConversationId];
      },
      onError: (err) => {
        logger.error({ error: err }, "Streaming connection error");
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id === activeConversationId) {
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
        setGeneratingStates((prev) => ({
          ...prev,
          [activeConversationId]: false,
        }));
        delete abortControllersRef.current[activeConversationId];
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
