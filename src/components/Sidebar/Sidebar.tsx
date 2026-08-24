import { forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { Conversation } from "../../types";
import { Bot, Plus, Settings as SettingsIcon, Sparkles, X } from "../Icons";
import { SelectField } from "../SelectField";
import type { SelectFieldItem } from "../SelectField";
import styles from "./Sidebar.module.scss";
import { ConversationListItem } from "./ConversationListItem";

export type SidebarProps = {
  disabled?: boolean;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  conversations: Conversation[];
  activeConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onPinConversation: (id: string, pinned: boolean) => Promise<boolean>;
  onRenameConversation: (id: string, title: string) => Promise<boolean>;
  onDeleteConversation: (id: string) => Promise<boolean>;
  onNewChat: () => void;
  canCreateConversation?: boolean;
  isCreatingChat?: boolean;
  hasMoreConversations?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
  modelOptionGroups: SelectFieldItem[];
  newConversationModelValue: string;
  hermesDefaultModel: string;
  onSelectNewConversationModel: (value: string) => void;
  isConnected: boolean;
  isFetchingModels?: boolean;
  connectionError?: string;
  onOpenSettings: () => void;
};

export const Sidebar = forwardRef<HTMLElement, SidebarProps>(
  (
    {
      disabled = false,
      isSidebarOpen,
      onToggleSidebar,
      conversations,
      activeConversationId,
      onSelectConversation,
      onPinConversation,
      onRenameConversation,
      onDeleteConversation,
      onNewChat,
      canCreateConversation = false,
      isCreatingChat,
      hasMoreConversations,
      isLoadingMore,
      onLoadMore,
      modelOptionGroups,
      newConversationModelValue,
      hermesDefaultModel,
      onSelectNewConversationModel,
      isConnected,
      isFetchingModels,
      connectionError,
      onOpenSettings,
    },
    ref,
  ) => {
    const { t } = useTranslation();
    const modelOptions: SelectFieldItem[] =
      modelOptionGroups.length === 0 && isFetchingModels
        ? [{ value: "", label: t("sidebar.fetchingModels") }]
        : modelOptionGroups.length === 0 && connectionError
          ? [{ value: "", label: `${connectionError.substring(0, 30)}...` }]
          : modelOptionGroups.length === 0 && !isConnected
            ? [{ value: "", label: t("sidebar.disconnected") }]
            : [
                {
                  value: "",
                  label: hermesDefaultModel
                    ? t("sidebar.hermesDefaultModel", {
                        model: hermesDefaultModel,
                      })
                    : t("sidebar.activeModel"),
                },
                ...modelOptionGroups,
              ];

    return (
      <aside
        ref={ref}
        className={`${styles.container} ${isSidebarOpen ? styles.open : ""}`}
        aria-disabled={disabled}
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
            disabled={disabled}
          >
            <X size={20} />
          </button>
        </div>

        {/* New Chat Button */}
        <div className={styles.newChatContainer}>
          <button
            onClick={onNewChat}
            className={styles.btnPrimary}
            disabled={disabled || isCreatingChat || !canCreateConversation}
          >
            <Plus size={16} />
            {isCreatingChat ? t("sidebar.creatingChat") : t("common.newChat")}
          </button>
        </div>

        {/* Model Selection */}
        <div className={styles.modelSelectionContainer}>
          <SelectField
            label={
              <>
                <Sparkles size={11} className={styles.sparklesIconSmall} />
                {t("sidebar.newConversationModel")}
              </>
            }
            value={newConversationModelValue}
            onChange={(event) =>
              onSelectNewConversationModel(event.target.value)
            }
            options={modelOptions}
            ariaLabel={t("sidebar.newConversationModel")}
            disabled={disabled || modelOptionGroups.length === 0}
          />
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
                <ConversationListItem
                  key={conv.id}
                  conversation={conv}
                  active={isActive}
                  disabled={disabled}
                  onSelect={() => onSelectConversation(conv.id)}
                  onPin={(pinned) => onPinConversation(conv.id, pinned)}
                  onRename={(title) => onRenameConversation(conv.id, title)}
                  onDelete={() => onDeleteConversation(conv.id)}
                />
              );
            })
          ) : (
            <div className={styles.conversationsEmpty}>
              {t("sidebar.noChats")}
            </div>
          )}
          {hasMoreConversations && onLoadMore && (
            <button
              onClick={onLoadMore}
              className={styles.loadMoreButton}
              disabled={disabled || isLoadingMore}
            >
              {isLoadingMore ? t("sidebar.loadingMore") : t("sidebar.loadMore")}
            </button>
          )}
        </div>

        {/* Sidebar Footer (Settings and Actions) */}
        <div className={styles.footer}>
          {/* Buttons Column */}
          <div className={styles.footerButtons}>
            <button
              onClick={onOpenSettings}
              className={styles.btnWarning}
              disabled={disabled}
            >
              <SettingsIcon size={14} />
              {t("sidebar.settings")}
            </button>
          </div>
        </div>
      </aside>
    );
  },
);
