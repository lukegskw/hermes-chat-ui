import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Toaster } from "sonner";
import {
  ChatWindow,
  ErrorBoundary,
  SettingsSheet,
  Sidebar,
} from "./components";
import {
  useChatState,
  useClientPresence,
  useHermesStream,
  useModels,
  useSwipeDrawer,
} from "./hooks";
import { getApiUrl } from "./config";
import { clearPwaBadge } from "./utils";

const HERMES_ENDPOINT = getApiUrl();

export const App = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] =
    useState<boolean>(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useClientPresence(HERMES_ENDPOINT);

  useEffect(() => {
    const clearWhenVisible = () => {
      if (document.visibilityState === "visible") void clearPwaBadge();
    };
    clearWhenVisible();
    document.addEventListener("visibilitychange", clearWhenVisible);
    return () =>
      document.removeEventListener("visibilitychange", clearWhenVisible);
  }, []);

  useSwipeDrawer(sidebarRef, backdropRef, {
    isOpen: isSidebarOpen,
    onOpen: () => setIsSidebarOpen(true),
    onClose: () => setIsSidebarOpen(false),
  });

  const {
    settings,
    handleSaveSettings,
    conversations,
    setConversations,
    activeConversationId,
    activeConversation,
    activeMessages,
    isInitializing,
    isLoadingMessages,
    isLoadingOlderMessages,
    hasOlderMessages,
    messageLoadError,
    isCreatingChat,
    isLoadingMore,
    hasMoreConversations,
    sessionError,
    handleNewChat,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    handlePinConversation,
    handleLoadMore,
    handleLoadOlderMessages,
    retryConversationMessages,
    reloadConversation,
  } = useChatState();

  const {
    providers,
    selectedProvider,
    selectedModel,
    reasoningEfforts,
    unconfirmedReasoningEfforts,
    reasoningDefaults,
    modelOptionGroups,
    newConversationModelValue,
    conversationModelValue,
    hermesDefaultModel,
    newConversationSelection,
    isUpdatingConversationModel,
    isConnected,
    isFetchingModels,
    connectionError,
    handleConversationModelChange,
    handleReasoningEffortChange,
    handleNewConversationModelChange,
    registerNewConversationSelection,
  } = useModels(
    HERMES_ENDPOINT,
    activeConversationId,
    activeConversation?.modelId,
    setConversations,
  );

  const {
    isGenerating,
    handleSendMessage,
    handleStopGeneration,
    handleCleanupConversation,
  } = useHermesStream(
    HERMES_ENDPOINT,
    settings,
    conversations,
    setConversations,
    activeConversationId,
    reloadConversation,
  );

  const { t } = useTranslation();

  const filteredConversations = settings.showOnlyUserChats
    ? conversations.filter((c) => {
        if (c.id === activeConversationId) return true;
        const s = (c.source || "").toLowerCase();
        return (
          s === "hermes_browser" ||
          s === "tui" ||
          s === "cli" ||
          s === "proactive"
        );
      })
    : conversations;
  const displayedProvider = activeConversation?.providerId || selectedProvider;
  const displayedModel = activeConversation?.modelId || selectedModel;
  const reasoningSupported =
    Boolean(displayedProvider && displayedModel) &&
    providers.find((provider) => provider.id === displayedProvider)
      ?.capabilities?.[displayedModel]?.reasoning !== false;
  const defaultReasoning =
    reasoningDefaults[displayedProvider]?.[displayedModel] || "provider";

  if (isInitializing) {
    return (
      <div className="loadingScreen">
        <div className="text">{t("loading.initializing")}</div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-center" richColors theme="dark" />
      <div id="root" className="layout">
        <div
          ref={backdropRef}
          className="sidebar-backdrop"
          style={{ display: isSidebarOpen ? "block" : "none" }}
          onClick={() => setIsSidebarOpen(false)}
        />

        <Sidebar
          ref={sidebarRef}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          conversations={filteredConversations}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            handleSelectConversation(id);
            setIsSidebarOpen(false);
          }}
          onPinConversation={handlePinConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={(id) =>
            handleDeleteConversation(id, () => {
              if (id === activeConversationId && isGenerating) {
                return handleStopGeneration();
              }
            })
          }
          onNewChat={() => {
            if (!newConversationSelection) return;
            void handleNewChat(newConversationSelection).then((session) => {
              if (session) {
                registerNewConversationSelection(
                  session.id,
                  newConversationSelection,
                );
              }
            });
            setIsSidebarOpen(false);
          }}
          canCreateConversation={Boolean(newConversationSelection)}
          isCreatingChat={isCreatingChat}
          hasMoreConversations={hasMoreConversations}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
          modelOptionGroups={modelOptionGroups}
          newConversationModelValue={newConversationModelValue}
          hermesDefaultModel={hermesDefaultModel}
          onSelectNewConversationModel={(value) => {
            handleNewConversationModelChange(value);
          }}
          isConnected={isConnected}
          isFetchingModels={isFetchingModels}
          connectionError={connectionError}
          onOpenSettings={() => {
            setIsSettingsSheetOpen(true);
            setIsSidebarOpen(false);
          }}
        />
        <ChatWindow
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          messages={activeMessages}
          activeConversation={activeConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={(id) => {
            void handleDeleteConversation(id, () => {
              if (id === activeConversationId && isGenerating) {
                return handleStopGeneration();
              }
            }).then((deleted) => {
              if (deleted) handleCleanupConversation(id);
            });
          }}
          isGenerating={isGenerating}
          onSendMessage={handleSendMessage}
          onStopGeneration={() => {
            handleStopGeneration();
          }}
          selectedModel={displayedModel}
          modelOptionGroups={modelOptionGroups}
          conversationModelValue={conversationModelValue}
          reasoningEffort={activeConversation?.reasoningEffort}
          reasoningSupported={reasoningSupported}
          reasoningEfforts={reasoningEfforts}
          unconfirmedReasoningEfforts={unconfirmedReasoningEfforts}
          defaultReasoning={defaultReasoning}
          onSelectModel={handleConversationModelChange}
          onSelectReasoningEffort={handleReasoningEffortChange}
          isFetchingModels={isFetchingModels}
          isUpdatingRuntime={isUpdatingConversationModel}
          connectionError={sessionError || connectionError}
          isLoadingMessages={isLoadingMessages}
          isLoadingOlderMessages={isLoadingOlderMessages}
          hasOlderMessages={hasOlderMessages}
          messageLoadError={messageLoadError}
          onLoadOlderMessages={handleLoadOlderMessages}
          onRetryMessages={retryConversationMessages}
          interactionLocked={isUpdatingConversationModel || isLoadingMessages}
        />
        <SettingsSheet
          isOpen={isSettingsSheetOpen}
          onClose={() => setIsSettingsSheetOpen(false)}
          settings={settings}
          onSaveSettings={handleSaveSettings}
        />
      </div>
    </ErrorBoundary>
  );
};
