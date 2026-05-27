import { useState } from "react";
import Sidebar from "./components/Sidebar";
import ChatWindow from "./components/ChatWindow";
import { useChatState } from "./hooks/useChatState";
import { useModels } from "./hooks/useModels";
import { useHermesStream } from "./hooks/useHermesStream";
import ErrorBoundary from "./components/ErrorBoundary";
import { Toaster } from 'sonner';

interface AppConfig {
  HERMES_API_URL?: string;
  HERMES_API_KEY?: string;
  HERMES_PROXY_PORT?: string;
}

declare global {
  interface Window {
    APP_CONFIG?: AppConfig;
  }
}

const getApiUrl = () => {
  try {
    const urlObj = new URL(
      window.APP_CONFIG?.HERMES_API_URL || "http://localhost:8642",
    );
    urlObj.port = window.APP_CONFIG?.HERMES_PROXY_PORT || "8643";
    return urlObj.toString().replace(/\/$/, "");
  } catch {
    return "http://localhost:8643";
  }
};

const HERMES_ENDPOINT = getApiUrl();
const HERMES_API_KEY = window.APP_CONFIG?.HERMES_API_KEY || "";
const HERMES_PROXY_PORT = window.APP_CONFIG?.HERMES_PROXY_PORT || "8643";

export default function App() {
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);

  const {
    settings,
    handleSaveSettings,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    activeMessages,
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
    HERMES_API_KEY, 
    HERMES_PROXY_PORT,
    activeConversationId,
    setConversations
  );

  const {
    isGenerating,
    pendingApproval,
    handleSendMessage,
    handleStopGeneration,
    handleRespondApproval
  } = useHermesStream(
    HERMES_ENDPOINT,
    HERMES_API_KEY,
    settings,
    conversations,
    setConversations,
    activeConversationId,
    setActiveConversationId,
    selectedModel,
    activeMessages
  );

  if (!HERMES_API_KEY) {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "hsl(var(--bg-deep))",
          color: "white",
          fontFamily: "var(--font-sans)",
          padding: "2rem",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "500px",
            padding: "2rem",
            backgroundColor: "hsl(var(--bg-card))",
            borderRadius: "var(--border-radius-lg)",
            border: "1px solid hsl(0 80% 60% / 0.5)",
            boxShadow: "0 0 20px hsl(0 80% 60% / 0.2)",
          }}
        >
          <h2 style={{ color: "hsl(0 80% 60%)", marginBottom: "1rem" }}>
            Acesso Bloqueado
          </h2>
          <p
            style={{
              color: "hsl(var(--text-secondary))",
              lineHeight: 1.6,
              fontSize: "0.95rem",
            }}
          >
            A interface Hermes UI foi configurada para exigir uma chave de API
            para funcionar.
            <br />
            <br />
            Por favor, defina a variável de ambiente{" "}
            <strong>HERMES_API_KEY</strong> no seu container do Portainer ou{" "}
            <code>docker-compose.yml</code>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <Toaster position="top-center" richColors theme="dark" />
      <div id="root">
        {isSidebarOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <Sidebar
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
          onDeleteConversation={handleDeleteConversation}
          onClearAll={handleClearAll}
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
