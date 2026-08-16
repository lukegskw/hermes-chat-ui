import { useCallback, useEffect, useRef, useState } from "react";
import i18n from "../i18n";
import {
  ChatMessage,
  ContentPart,
  Conversation,
  GenerationSnapshot,
  ToolCall,
} from "../types";
import {
  cancelSessionChat,
  logger,
  prepareImageContent,
  resumeChatMessageStream,
  sendChatMessageStream,
  updateConversationTitle,
} from "../utils";

export const useHermesStream = (
  endpoint: string,
  settings: { systemPrompt?: string; enableXmlCodeBlocks?: boolean },
  conversations: Conversation[],
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
  activeConversationId: string,
  conversationHistoryReady: boolean,
  reloadConversation: (id: string, signal?: AbortSignal) => Promise<void>,
) => {
  const [generatingStates, setGeneratingStates] = useState<
    Record<string, boolean>
  >({});
  const abortControllersRef = useRef<
    Record<string, AbortController | undefined>
  >({});
  const [checkedGenerationFor, setCheckedGenerationFor] = useState("");

  const isGenerating = generatingStates[activeConversationId] || false;
  const isCheckingGeneration = Boolean(
    activeConversationId &&
    !isGenerating &&
    (!conversationHistoryReady ||
      checkedGenerationFor !== activeConversationId),
  );

  const handleCleanupConversation = (id: string) => {
    setGeneratingStates((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    abortControllersRef.current[id]?.abort();
    delete abortControllersRef.current[id];
    setCheckedGenerationFor((previous) => (previous === id ? "" : previous));
  };

  const updateAssistantMessage = useCallback(
    (
      conversationId: string,
      messageId: string,
      update: (message: ChatMessage) => ChatMessage,
    ) => {
      setConversations((previous) =>
        previous.map((conversation) =>
          conversation.id === conversationId
            ? {
                ...conversation,
                messages: conversation.messages.map((message) =>
                  message.id === messageId ? update(message) : message,
                ),
              }
            : conversation,
        ),
      );
    },
    [setConversations],
  );

  const applyToolCallChunk = useCallback(
    (conversationId: string, messageId: string, value: unknown) => {
      const delta = value as {
        index?: number;
        id: string;
        type: string;
        function?: { name?: string; arguments?: string };
        status?: "running" | "completed" | "error";
        label?: string;
      };
      updateAssistantMessage(conversationId, messageId, (message) => {
        const index = delta.index ?? 0;
        const current = message.tool_calls ?? [];
        const next = current.map((tool) => ({
          ...tool,
          function: { ...tool.function },
        }));
        const existing = next[index] as ToolCall | undefined;
        next[index] = existing
          ? {
              ...existing,
              function: {
                ...existing.function,
                arguments:
                  delta.function?.arguments || existing.function.arguments,
              },
              status: delta.status || existing.status,
              label: delta.label || existing.label,
            }
          : {
              id: delta.id,
              type: delta.type,
              function: {
                name: delta.function?.name || "",
                arguments: delta.function?.arguments || "",
              },
              status: delta.status || "running",
              label: delta.label || "",
            };
        return { ...message, tool_calls: next };
      });
    },
    [updateAssistantMessage],
  );

  const restoreGenerationSnapshot = useCallback(
    (conversationId: string, snapshot: GenerationSnapshot): string => {
      const messageId = `active_${snapshot.messageId}`;
      const assistantMessage: ChatMessage = {
        id: messageId,
        role: "assistant",
        content: snapshot.content,
        reasoning_content: snapshot.reasoningContent,
        tool_calls: snapshot.toolCalls,
        isGenerating: true,
        timestamp: new Date().toISOString(),
      };
      setConversations((previous) =>
        previous.map((conversation) => {
          if (conversation.id !== conversationId) return conversation;
          const existingIndex = conversation.messages.findIndex(
            (message) => message.id === messageId,
          );
          if (existingIndex >= 0) {
            const messages = [...conversation.messages];
            messages[existingIndex] = assistantMessage;
            return { ...conversation, messages };
          }
          let lastUserIndex = -1;
          for (
            let index = conversation.messages.length - 1;
            index >= 0;
            index -= 1
          ) {
            if (conversation.messages[index].role === "user") {
              lastUserIndex = index;
              break;
            }
          }
          return {
            ...conversation,
            messages: [
              ...conversation.messages.slice(0, lastUserIndex + 1),
              assistantMessage,
            ],
          };
        }),
      );
      return messageId;
    },
    [setConversations],
  );

  useEffect(() => {
    const conversationId = activeConversationId;
    if (!conversationId) return;
    if (!conversationHistoryReady) return;
    const controllers = abortControllersRef.current;
    if (controllers[conversationId]) return;

    const controller = new AbortController();
    controllers[conversationId] = controller;
    let assistantMessageId = "";
    const finishRecoveredGeneration = () => {
      if (assistantMessageId) {
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => ({ ...message, isGenerating: false }),
        );
      }
      setGeneratingStates((previous) => ({
        ...previous,
        [conversationId]: false,
      }));
      setCheckedGenerationFor(conversationId);
      if (controllers[conversationId] === controller) {
        delete controllers[conversationId];
      }
      if (document.visibilityState === "visible") {
        void reloadConversation(conversationId);
      }
    };

    const recover = async () => {
      while (!controller.signal.aborted) {
        try {
          const active = await resumeChatMessageStream({
            endpoint,
            conversationId,
            message: "",
            signal: controller.signal,
            onGenerationSnapshot: (snapshot) => {
              assistantMessageId = restoreGenerationSnapshot(
                conversationId,
                snapshot,
              );
              setGeneratingStates((previous) => ({
                ...previous,
                [conversationId]: true,
              }));
              setCheckedGenerationFor(conversationId);
            },
            onChunk: (chunk) => {
              if (!assistantMessageId) return;
              updateAssistantMessage(
                conversationId,
                assistantMessageId,
                (message) => ({
                  ...message,
                  content: `${typeof message.content === "string" ? message.content : ""}${chunk}`,
                }),
              );
            },
            onReasoningChunk: (chunk) => {
              if (!assistantMessageId) return;
              updateAssistantMessage(
                conversationId,
                assistantMessageId,
                (message) => ({
                  ...message,
                  reasoning_content: `${message.reasoning_content || ""}${chunk}`,
                }),
              );
            },
            onReasoningSnapshot: (content) => {
              if (!assistantMessageId) return;
              updateAssistantMessage(
                conversationId,
                assistantMessageId,
                (message) => ({ ...message, reasoning_content: content }),
              );
            },
            onToolCallChunk: (value) => {
              if (assistantMessageId) {
                applyToolCallChunk(conversationId, assistantMessageId, value);
              }
            },
            onDone: finishRecoveredGeneration,
            onError: (error) => {
              logger.error({ error }, "Failed to resume Hermes session stream");
            },
          });
          if (!active) {
            setCheckedGenerationFor(conversationId);
            if (controllers[conversationId] === controller) {
              delete controllers[conversationId];
            }
          }
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 750));
        }
      }
    };
    void recover();
    return () => {
      controller.abort();
      if (controllers[conversationId] === controller) {
        delete controllers[conversationId];
      }
    };
  }, [
    activeConversationId,
    applyToolCallChunk,
    conversationHistoryReady,
    endpoint,
    reloadConversation,
    restoreGenerationSnapshot,
    updateAssistantMessage,
  ]);

  const handleSendMessage = async (
    text: string,
    attachments?: File[],
  ): Promise<boolean> => {
    const conversationId = activeConversationId;
    const target = conversations.find(
      (conversation) => conversation.id === conversationId,
    );
    if (
      !target ||
      (!text.trim() && (!attachments || attachments.length === 0)) ||
      generatingStates[conversationId] ||
      checkedGenerationFor !== conversationId
    ) {
      return false;
    }

    let messageContent: string | ContentPart[] = text.trim();
    const optimisticMessages = [...target.messages];
    if (attachments && attachments.length > 0) {
      try {
        messageContent = await prepareImageContent(text.trim(), attachments);
      } catch (error) {
        logger.error({ error }, "Failed to prepare images for Hermes");
        throw error;
      }
    }

    const userMessage: ChatMessage = {
      id: `local_user_${Date.now()}`,
      role: "user",
      content: messageContent,
      timestamp: new Date().toISOString(),
    };
    const assistantMessageId = `local_assistant_${Date.now()}`;
    const assistantMessage: ChatMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      isGenerating: true,
      timestamp: new Date().toISOString(),
    };
    optimisticMessages.push(userMessage, assistantMessage);

    let nextTitle = target.title;
    if (!nextTitle) {
      nextTitle = text.trim().slice(0, 40) || i18n.t("chat.imageConversation");
      void updateConversationTitle(endpoint, conversationId, nextTitle).catch(
        (error) => {
          logger.error({ error }, "Failed to set initial session title");
        },
      );
    }

    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId
          ? { ...conversation, title: nextTitle, messages: optimisticMessages }
          : conversation,
      ),
    );
    setGeneratingStates((previous) => ({
      ...previous,
      [conversationId]: true,
    }));
    setCheckedGenerationFor(conversationId);

    const controller = new AbortController();
    abortControllersRef.current[conversationId] = controller;
    const instructions = [
      settings.systemPrompt?.trim(),
      settings.enableXmlCodeBlocks === false
        ? ""
        : "Use language-specific XML tags such as <python> or <typescript> for code blocks instead of Markdown backticks.",
    ]
      .filter(Boolean)
      .join("\n\n");

    void sendChatMessageStream({
      endpoint,
      message: messageContent,
      instructions,
      conversationId,
      signal: controller.signal,
      onGenerationSnapshot: (snapshot) => {
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => ({
            ...message,
            content: snapshot.content,
            reasoning_content: snapshot.reasoningContent,
            tool_calls: snapshot.toolCalls,
          }),
        );
      },
      onChunk: (chunk) => {
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => ({
            ...message,
            content: `${typeof message.content === "string" ? message.content : ""}${chunk}`,
          }),
        );
      },
      onReasoningChunk: (chunk) => {
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => ({
            ...message,
            reasoning_content: `${message.reasoning_content || ""}${chunk}`,
          }),
        );
      },
      onReasoningSnapshot: (content) => {
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => ({ ...message, reasoning_content: content }),
        );
      },
      onToolCallChunk: (value) =>
        applyToolCallChunk(conversationId, assistantMessageId, value),
      onDone: () => {
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => ({
            ...message,
            isGenerating: false,
          }),
        );
        setGeneratingStates((previous) => ({
          ...previous,
          [conversationId]: false,
        }));
        setCheckedGenerationFor(conversationId);
        delete abortControllersRef.current[conversationId];
        if (document.visibilityState === "visible") {
          void reloadConversation(conversationId);
        }
      },
      onError: (error) => {
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => ({
            ...message,
            isGenerating: false,
            content: `${typeof message.content === "string" ? message.content : ""}\n\n${i18n.t("errors.connectionError", { message: error.message })}`,
          }),
        );
        setGeneratingStates((previous) => ({
          ...previous,
          [conversationId]: false,
        }));
        setCheckedGenerationFor(conversationId);
        delete abortControllersRef.current[conversationId];
      },
    }).catch((error: unknown) => {
      logger.error({ error }, "Unexpected Hermes stream failure");
    });
    return true;
  };

  const handleStopGeneration = async () => {
    const conversationId = activeConversationId;
    const controller = abortControllersRef.current[conversationId];
    controller?.abort();
    setConversations((previous) =>
      previous.map((conversation) =>
        conversation.id === conversationId
          ? {
              ...conversation,
              messages: conversation.messages.map((message) =>
                message.isGenerating
                  ? { ...message, isGenerating: false }
                  : message,
              ),
            }
          : conversation,
      ),
    );
    setGeneratingStates((previous) => ({
      ...previous,
      [conversationId]: false,
    }));
    setCheckedGenerationFor(conversationId);
    delete abortControllersRef.current[conversationId];
    try {
      await cancelSessionChat(endpoint, conversationId);
      if (document.visibilityState === "visible") {
        await reloadConversation(conversationId);
      }
    } catch (error) {
      logger.error({ error }, "Failed to stop Hermes session stream");
    }
  };

  return {
    isGenerating,
    isCheckingGeneration,
    handleSendMessage,
    handleStopGeneration,
    handleCleanupConversation,
  };
};
