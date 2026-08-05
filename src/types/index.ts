export type Model = {
  id: string;
  object?: string | null;
  created?: number | null;
  owned_by?: string | null;
  label?: string | null;
};

export type ToolCall = {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
  status?: "running" | "completed" | "error";
  label?: string;
};

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string | ContentPart[];
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  isGenerating?: boolean;
  timestamp?: string;
};

export type ConversationAPI = {
  id: string;
  title: string;
  modelId?: string | null;
  source?: string | null;
  messages: ChatMessage[];
  lastActive?: number | null;
  messageCount?: number;
};

export type SendChatMessageStreamOptions = {
  endpoint: string;
  model?: string;
  message: string | ContentPart[];
  instructions?: string;
  conversationId: string;
  onChunk: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onToolCallChunk?: (toolCallDelta: unknown) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId?: string | null;
  source?: string | null;
  lastActive?: number | null;
  messageCount?: number;
};

export type ConversationsPage = {
  conversations: ConversationAPI[];
  hasMore: boolean;
};

export type Settings = {
  systemPrompt: string;
  enableXmlCodeBlocks?: boolean;
  showOnlyUserChats?: boolean;
};

export type ImageValidationResult = {
  valid: boolean;
  error?: string;
};

export type AppConfig = {
  HERMES_API_URL?: string;
  HERMES_PROXY_PORT?: string;
};

export type SwipeDrawerOptions = {
  edgeZone?: number;
  threshold?: number;
  velocityThreshold?: number;
  sidebarWidth?: number;
  onOpen: () => void;
  onClose: () => void;
  isOpen: boolean;
  enabled?: boolean;
};
