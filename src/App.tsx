import { useState, useRef } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { useChatState } from "./hooks/useChatState";
import { useModels } from "./hooks/useModels";
import { useHermesStream } from "./hooks/useHermesStream";
import { useSwipeDrawer } from "./hooks/useSwipeDrawer";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from 'sonner';

export default function App() {
  const HERMES_ENDPOINT = "";

  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

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
    setActiveConversationId,
    activeConversation,
    activeMessages,
    isInitializing,
    handleNewChat,
    handleSelectConversation,
    handleDeleteConversation,
    handleClearAll,
  } = useChatState();

  const {
    models,
    selectedModel,
    isConnected,
    isFetchingModels,
    connectionError,
    handleSelectModel,
    handleConversationModelChange
  } = useModels(
    HERMES_ENDPOINT,
    activeConversationId,
    setConversations
  );

  const {
    isGenerating,
    pendingApproval,
    handleSendMessage,
    handleStopGeneration,
    handleRespondApproval,
    handleCleanupConversation,
    handleCleanupAllConversations
  } = useHermesStream(
    HERMES_ENDPOINT,
    settings,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    selectedModel,
    activeMessages
  );



  if (isInitializing) {
    return (
      <div style={{ display: 'flex', height: '100vh', width: '100vw', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-base)' }}>
        <div style={{ color: 'var(--text-muted)' }}>Carregando histórico...</div>
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
          style={{ display: isSidebarOpen ? 'block' : 'none' }}
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
            handleNewChat();
            setIsSidebarOpen(false);
          }}
          onDeleteConversation={(id) => {
            handleDeleteConversation(id);
            handleCleanupConversation(id);
          }}
          onClearAll={() => {
            handleClearAll();
            handleCleanupAllConversations();
          }}
          models={models}
          selectedModel={selectedModel}
          onSelectModel={handleSelectModel}
          isConnected={isConnected}
          isFetchingModels={isFetchingModels}
          connectionError={connectionError}
          settings={settings}
          onSaveSettings={handleSaveSettings}
        />
        <ChatWindow
          onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
          messages={activeMessages}
          isGenerating={isGenerating}
          onSendMessage={handleSendMessage}
          onStopGeneration={handleStopGeneration}
          selectedModel={activeConversation?.modelId || selectedModel}
          models={models}
          onSelectModel={handleConversationModelChange}
          isFetchingModels={isFetchingModels}
          connectionError={connectionError}
          pendingApproval={pendingApproval}
          onRespondApproval={handleRespondApproval}
        />
      </div>
    </ErrorBoundary>
  );
}
