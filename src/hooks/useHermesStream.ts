import { useRef, useState } from "react";
import i18n from "../i18n";
import { ChatMessage, ContentPart, Conversation, ToolCall } from "../types";
import {
  cancelSessionChat,
  logger,
  prepareImageContent,
  sendChatMessageStream,
  updateConversationTitle,
} from "../utils";

export const useHermesStream = (
  endpoint: string,
  settings: { systemPrompt?: string; enableXmlCodeBlocks?: boolean },
  conversations: Conversation[],
  setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>,
  activeConversationId: string,
  selectedModel: string,
  reloadConversation: (id: string, signal?: AbortSignal) => Promise<void>,
) => {
  const [generatingStates, setGeneratingStates] = useState<
    Record<string, boolean>
  >({});
  const abortControllersRef = useRef<
    Record<string, AbortController | undefined>
  >({});

  const isGenerating = generatingStates[activeConversationId] || false;

  const handleCleanupConversation = (id: string) => {
    setGeneratingStates((previous) => {
      const next = { ...previous };
      delete next[id];
      return next;
    });
    abortControllersRef.current[id]?.abort();
    delete abortControllersRef.current[id];
  };

  const updateAssistantMessage = (
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
  };

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
      generatingStates[conversationId]
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
      model: target.modelId || selectedModel,
      message: messageContent,
      instructions,
      conversationId,
      signal: controller.signal,
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
      onToolCallChunk: (value) => {
        const delta = value as {
          index?: number;
          id: string;
          type: string;
          function?: { name?: string; arguments?: string };
          status?: "running" | "completed" | "error";
          label?: string;
        };
        updateAssistantMessage(
          conversationId,
          assistantMessageId,
          (message) => {
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
          },
        );
      },
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
    if (!controller) return;
    controller.abort();
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
    delete abortControllersRef.current[conversationId];
    try {
      await cancelSessionChat(endpoint, conversationId);
    } catch (error) {
      logger.error({ error }, "Failed to cancel Hermes session stream");
    }
  };

  return {
    isGenerating,
    handleSendMessage,
    handleStopGeneration,
    handleCleanupConversation,
  };
};
