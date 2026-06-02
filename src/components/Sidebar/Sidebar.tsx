import { forwardRef } from "react";
import {
  Bot,
  Plus,
  Trash2,
  Settings as SettingsIcon,
  MessageSquare,
  Sparkles,
  X,
} from "../Icons";
import { Model, ChatMessage } from "../../types";
import "./Sidebar.css";
import "./Settings.css";

export type Conversation = {
  id: string;
  title: string;
  modelId?: string;
  messages: ChatMessage[];
};

export type Settings = {
  systemPrompt?: string;
};

export type SidebarProps = {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onClearAll: () => void;
  models: Model[];
  selectedModel: string;
  onSelectModel: (modelId: string) => void;
  isConnected: boolean;
  isFetchingModels?: boolean;
  connectionError?: string;
  onOpenSettings: () => void;
};

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  (
    {
      isSidebarOpen,
      onToggleSidebar,
      conversations,
      activeConversationId,
      onSelectConversation,
      onNewChat,
      onClearAll,
      models,
      selectedModel,
      onSelectModel,
      isConnected,
      isFetchingModels,
      connectionError,
      onOpenSettings,
    },
    ref,
  ) => {
    return (
      <aside
        ref={ref}
        className={`sidebar-container ${isSidebarOpen ? "sidebar-open" : ""}`}
      >
        {/* Sidebar Header with Notch Support */}
        <div className="sidebar-header">
          <div className="sidebar-logo-container">
            <div className="sidebar-logo-circle">
              <Bot size={20} color="white" />
            </div>
            <div>
              <h1 className="sidebar-title">Hermes Chat</h1>
              <div className="sidebar-status-container">
                <div
                  className={`status-indicator ${isFetchingModels ? "fetching" : isConnected ? "online" : "offline"}`}
                />
                <span
                  className={`status-text ${isFetchingModels ? "fetching" : isConnected ? "online" : "offline"}`}
                >
                  {isFetchingModels
                    ? "Conectando..."
                    : isConnected
                      ? "Online"
                      : "Offline"}
                </span>
              </div>
            </div>
          </div>

          {/* Mobile-only Close Drawer Button */}
          <button
            onClick={onToggleSidebar}
            className="mobile-close-sidebar-btn"
            title="Fechar painel"
          >
            <X size={20} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className="new-chat-container">
          <button onClick={onNewChat} className="btn-primary">
            <Plus size={16} />
            Nova Conversa
          </button>
        </div>

        {/* Model Selection */}
        <div className="model-selection-container">
          <div className="model-selection-box">
            <label className="model-label">
              <Sparkles size={11} className="sparkles-icon-small" />
              Modelo Ativo
            </label>
            <select
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              className="model-select"
              disabled={
                (!isConnected && !isFetchingModels) || models.length === 0
              }
            >
              {models.length === 0 && isFetchingModels ? (
                <option value={selectedModel}>
                  {selectedModel || "Buscando Modelos..."}
                </option>
              ) : models.length === 0 && connectionError ? (
                <option value="">{connectionError.substring(0, 30)}...</option>
              ) : models.length === 0 && isConnected ? (
                <option value={selectedModel}>
                  {selectedModel || "Sem Modelos"}
                </option>
              ) : models.length === 0 && !isConnected ? (
                <option value="">Hermes desconectado</option>
              ) : (
                models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label || m.id}
                  </option>
                ))
              )}
            </select>
            {/* Custom dropdown arrow */}
            <div className="select-arrow-container">
              <svg
                width="10"
                height="6"
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

        {/* Conversations List */}
        <div className="conversations-list">
          <div className="conversations-heading">Conversas Recentes</div>

          {conversations.length > 0 ? (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`conversation-item ${isActive ? "active" : ""}`}
                >
                  <div className="conversation-item-content">
                    <MessageSquare size={15} className="conversation-icon" />

                    <span className="conversation-title">
                      {conv.title || "Conversa sem título"}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="conversations-empty">Nenhuma conversa iniciada</div>
          )}
        </div>

        {/* Sidebar Footer (Settings and Actions) */}
        <div className="sidebar-footer">
          {/* Buttons Column */}
          <div className="sidebar-footer-buttons">
            <button onClick={onOpenSettings} className="btn-warning">
              <SettingsIcon size={14} />
              Ajustes
            </button>

            {conversations.length > 0 && (
              <button
                onClick={onClearAll}
                className="btn-danger"
                title="Limpar todas as conversas"
              >
                <Trash2 size={14} />
                Apagar Chats
              </button>
            )}
          </div>
        </div>
      </aside>
    );
  },
);
