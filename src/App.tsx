import { useCallback, useEffect, useRef, useState } from "react";
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
  const [isTranscribing, setIsTranscribing] = useState(false);
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
    onOpen: () => {
      if (!isTranscribing) setIsSidebarOpen(true);
    },
    onClose: () => {
      if (!isTranscribing) setIsSidebarOpen(false);
    },
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
    isCreatingChat,
    isLoadingMore,
    hasMoreConversations,
    sessionError,
    handleNewChat,
    handleSelectConversation,
    handleDeleteConversation,
    handleRenameConversation,
    handleLoadMore,
    reloadConversation,
  } = useChatState();

  const {
    models,
    selectedModel,
    isConnected,
    isFetchingModels,
    connectionError,
    handleSelectModel,
    handleConversationModelChange,
  } = useModels(HERMES_ENDPOINT, activeConversationId, setConversations);

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
    selectedModel,
    reloadConversation,
  );

  const { t } = useTranslation();

  const handleTranscriptionStateChange = useCallback(
    (nextIsTranscribing: boolean) => {
      setIsTranscribing(nextIsTranscribing);
      if (nextIsTranscribing) {
        setIsSidebarOpen(false);
        setIsSettingsSheetOpen(false);
      }
    },
    [],
  );

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
      <div
        id="root"
        className="layout"
        inert={isTranscribing}
        aria-busy={isTranscribing}
      >
        <div
          ref={backdropRef}
          className="sidebar-backdrop"
          style={{ display: isSidebarOpen ? "block" : "none" }}
          onClick={() => {
            if (!isTranscribing) setIsSidebarOpen(false);
          }}
        />

        <Sidebar
          ref={sidebarRef}
          disabled={isTranscribing}
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => {
            if (!isTranscribing) setIsSidebarOpen((prev) => !prev);
          }}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            if (isTranscribing) return;
            handleSelectConversation(id);
            setIsSidebarOpen(false);
          }}
          onNewChat={() => {
            if (isTranscribing) return;
            handleNewChat(selectedModel);
            setIsSidebarOpen(false);
          }}
          isCreatingChat={isCreatingChat}
          hasMoreConversations={hasMoreConversations}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
          models={models}
          selectedModel={selectedModel}
          onSelectModel={(modelId) => {
            if (!isTranscribing) handleSelectModel(modelId);
          }}
          isConnected={isConnected}
          isFetchingModels={isFetchingModels}
          connectionError={connectionError}
          onOpenSettings={() => {
            if (isTranscribing) return;
            setIsSettingsSheetOpen(true);
            setIsSidebarOpen(false);
          }}
        />
        <ChatWindow
          onToggleSidebar={() => {
            if (!isTranscribing) setIsSidebarOpen((prev) => !prev);
          }}
          messages={activeMessages}
          activeConversation={activeConversation}
          onRenameConversation={handleRenameConversation}
          onDeleteConversation={(id) => {
            if (isTranscribing) return;
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
            if (!isTranscribing) handleStopGeneration();
          }}
          endpoint={HERMES_ENDPOINT}
          selectedModel={activeConversation?.modelId || selectedModel}
          models={models}
          onSelectModel={(modelId) => {
            if (!isTranscribing) handleConversationModelChange(modelId);
          }}
          isFetchingModels={isFetchingModels}
          connectionError={sessionError || connectionError}
          isLoadingMessages={isLoadingMessages}
          interactionLocked={isTranscribing}
          onTranscriptionStateChange={handleTranscriptionStateChange}
        />
        <SettingsSheet
          isOpen={isSettingsSheetOpen}
          onClose={() => {
            if (!isTranscribing) setIsSettingsSheetOpen(false);
          }}
          settings={settings}
          onSaveSettings={handleSaveSettings}
        />
      </div>
    </ErrorBoundary>
  );
};
