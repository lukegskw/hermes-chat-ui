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
import styles from "./Sidebar.module.scss";

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
        className={`${styles.container} ${isSidebarOpen ? styles.open : ""}`}
      >
        {/* Sidebar Header with Notch Support */}
        <div className={styles.header}>
          <div className={styles.logoContainer}>
            <div className={styles.logoCircle}>
              <Bot size={20} color="white" />
            </div>
            <div>
              <h1 className={styles.title}>Hermes Chat</h1>
              <div className={styles.statusContainer}>
                <div
                  className={`${styles.statusIndicator} ${isFetchingModels ? styles.fetching : isConnected ? styles.online : styles.offline}`}
                />
                <span
                  className={`${styles.statusText} ${isFetchingModels ? styles.fetching : isConnected ? styles.online : styles.offline}`}
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
            className={styles.mobileCloseBtn}
            title="Fechar painel"
          >
            <X size={20} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className={styles.newChatContainer}>
          <button onClick={onNewChat} className={styles.btnPrimary}>
            <Plus size={16} />
            Nova Conversa
          </button>
        </div>

        {/* Model Selection */}
        <div className={styles.modelSelectionContainer}>
          <div className={styles.modelSelectionBox}>
            <label className={styles.modelLabel}>
              <Sparkles size={11} className={styles.sparklesIconSmall} />
              Modelo Ativo
            </label>
            <select
              value={selectedModel}
              onChange={(e) => onSelectModel(e.target.value)}
              className={styles.modelSelect}
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
            <div className={styles.selectArrowContainer}>
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
        <div className={styles.conversationsList}>
          <div className={styles.conversationsHeading}>Conversas Recentes</div>

          {conversations.length > 0 ? (
            conversations.map((conv) => {
              const isActive = conv.id === activeConversationId;
              return (
                <div
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`${styles.conversationItem} ${isActive ? styles.active : ""}`}
                >
                  <div className={styles.conversationItemContent}>
                    <MessageSquare
                      size={15}
                      className={styles.conversationIcon}
                    />

                    <span className={styles.conversationTitle}>
                      {conv.title || "Conversa sem título"}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.conversationsEmpty}>
              Nenhuma conversa iniciada
            </div>
          )}
        </div>

        {/* Sidebar Footer (Settings and Actions) */}
        <div className={styles.footer}>
          {/* Buttons Column */}
          <div className={styles.footerButtons}>
            <button onClick={onOpenSettings} className={styles.btnWarning}>
              <SettingsIcon size={14} />
              Ajustes
            </button>

            {conversations.length > 0 && (
              <button
                onClick={onClearAll}
                className={styles.btnDanger}
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
