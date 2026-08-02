import { useRef, useState } from "react";
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
  useHermesStream,
  useModels,
  useSwipeDrawer,
  usePresenceHeartbeat,
} from "./hooks";
import { getApiUrl } from "./config";

const HERMES_ENDPOINT = getApiUrl();

export const App = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isSettingsSheetOpen, setIsSettingsSheetOpen] =
    useState<boolean>(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  usePresenceHeartbeat();

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
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={(id) => {
            handleSelectConversation(id);
            setIsSidebarOpen(false);
          }}
          onNewChat={() => {
            handleNewChat(selectedModel);
            setIsSidebarOpen(false);
          }}
          isCreatingChat={isCreatingChat}
          hasMoreConversations={hasMoreConversations}
          isLoadingMore={isLoadingMore}
          onLoadMore={handleLoadMore}
          models={models}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
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
          onStopGeneration={handleStopGeneration}
          selectedModel={activeConversation?.modelId || selectedModel}
          models={models}
          onSelectModel={handleConversationModelChange}
          isFetchingModels={isFetchingModels}
          connectionError={sessionError || connectionError}
          isLoadingMessages={isLoadingMessages}
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
