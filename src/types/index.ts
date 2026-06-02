export type Model = {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
  label?: string;
};

export type ToolCall = {
  id: string;
  type: string;
  function: {
    name: string;
    arguments: string;
  };
  status?: "running" | "completed" | "error";
};

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string | ContentPart[];
  reasoning_content?: string;
  tool_calls?: ToolCall[];
  isGenerating?: boolean;
  timestamp?: string;
};

export type ConversationAPI = {
  id: string;
  title: string;
  modelId?: string;
  messages: ChatMessage[];
  updated_at?: string;
};

export type SendChatMessageStreamOptions = {
  endpoint: string;
  model: string;
  messages: ChatMessage[];
  systemPrompt: string;
  conversationId?: string;
  onChunk: (chunk: string) => void;
  onReasoningChunk?: (chunk: string) => void;
  onToolCallChunk?: (toolCallDelta: unknown) => void;
  onDone: () => void;
  onError: (error: Error) => void;
  signal?: AbortSignal;
};

export type PendingApproval = {
  id: string;
  tool: string;
  command: string;
  label?: string;
  risk_level?: string;
  session_id?: string;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  modelId?: string;
};

export type Settings = {
  systemPrompt: string;
};

export type ImageValidationResult = {
  valid: boolean;
  error?: string;
};

export type AppConfig = {
  HERMES_API_URL?: string;
  HERMES_API_KEY?: string;
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
