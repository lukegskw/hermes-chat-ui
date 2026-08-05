import { ChatMessage } from "../types";

export const reconcileSessionMessages = (
  localMessages: ChatMessage[],
  incomingMessages: ChatMessage[],
): ChatMessage[] =>
  localMessages.some((message) => message.isGenerating)
    ? localMessages
    : incomingMessages;
