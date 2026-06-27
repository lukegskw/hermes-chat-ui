import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Conversation, Model } from "../../types";
import {
  Bot,
  MessageSquare,
  Plus,
  Settings as SettingsIcon,
  Sparkles,
  Trash2,
  X,
} from "../Icons";
import styles from "./Sidebar.module.scss";

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
    const { t } = useTranslation();

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
                    ? t("common.connecting")
                    : isConnected
                      ? t("common.online")
                      : t("common.offline")}
                </span>
              </div>
            </div>
          </div>

          {/* Mobile-only Close Drawer Button */}
          <button
            onClick={onToggleSidebar}
            className={styles.mobileCloseBtn}
            title={t("sidebar.closePanel")}
          >
            <X size={20} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className={styles.newChatContainer}>
          <button onClick={onNewChat} className={styles.btnPrimary}>
            <Plus size={16} />
            {t("common.newChat")}
          </button>
        </div>

        {/* Model Selection */}
        <div className={styles.modelSelectionContainer}>
          <div className={styles.modelSelectionBox}>
            <label className={styles.modelLabel}>
              <Sparkles size={11} className={styles.sparklesIconSmall} />
              {t("sidebar.activeModel")}
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
                  {selectedModel || t("sidebar.fetchingModels")}
                </option>
              ) : models.length === 0 && connectionError ? (
                <option value="">{connectionError.substring(0, 30)}...</option>
              ) : models.length === 0 && isConnected ? (
                <option value={selectedModel}>
                  {selectedModel || t("sidebar.noModels")}
                </option>
              ) : models.length === 0 && !isConnected ? (
                <option value="">{t("sidebar.disconnected")}</option>
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
          <div className={styles.conversationsHeading}>
            {t("sidebar.recentChats")}
          </div>

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
                      {conv.title || t("common.newChat")}
                    </span>
                  </div>
                </div>
              );
            })
          ) : (
            <div className={styles.conversationsEmpty}>
              {t("sidebar.noChats")}
            </div>
          )}
        </div>

        {/* Sidebar Footer (Settings and Actions) */}
        <div className={styles.footer}>
          {/* Buttons Column */}
          <div className={styles.footerButtons}>
            <button onClick={onOpenSettings} className={styles.btnWarning}>
              <SettingsIcon size={14} />
              {t("sidebar.settings")}
            </button>

            {conversations.length > 0 && (
              <button
                onClick={onClearAll}
                className={styles.btnDanger}
                title={t("sidebar.deleteChats")}
              >
                <Trash2 size={14} />
                {t("sidebar.deleteChats")}
              </button>
            )}
          </div>
        </div>
      </aside>
    );
  },
);
