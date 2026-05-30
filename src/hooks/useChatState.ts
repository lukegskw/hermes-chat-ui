import { useState, useEffect, useCallback } from "react";
import { Conversation, Settings } from "../components/Sidebar";
import {
  fetchConversations,
  fetchConversation,
  createConversation,
  deleteConversation,
  deleteAllConversations,
} from "../utils/api";
import { getApiUrl } from "../config/env";

const DEFAULT_SETTINGS: Settings = {
  systemPrompt:
    'Você é o Hermes, um assistente autônomo de inteligência artificial poderoso e prestativo. Responda em Português do Brasil.\n\nCRITICAL INSTRUCTION: Se uma ferramenta retornar um erro com o status "approval_required", você DEVE pedir permissão ao usuário imprimindo EXATAMENTE a seguinte string no final da sua resposta: [APPROVAL_REQUIRED: <comando_a_executar>]\nApós imprimir essa string, pare a geração e aguarde a resposta do usuário.',
};

export function useChatState() {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("hermes_settings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isInitializing, setIsInitializing] = useState<boolean>(true);

  const endpoint = getApiUrl();

  useEffect(() => {
    localStorage.setItem("hermes_settings", JSON.stringify(settings));
  }, [settings]);

  // Expose reload method for external components and focus sync
  const loadConversationsList = useCallback(async () => {
    const list = await fetchConversations(endpoint);
    setConversations(list as Conversation[]);
    setActiveConversationId((prev) => {
      if (!prev && list.length > 0) return list[0].id;
      return prev;
    });
  }, [endpoint]);

  // Initial load
  useEffect(() => {
    let active = true;
    const initialLoad = async () => {
      setIsInitializing(true);
      const list = await fetchConversations(endpoint);
      if (!active) return;
      setConversations(list as Conversation[]);
      setActiveConversationId((prev) => {
        if (!prev && list.length > 0) return list[0].id;
        return prev;
      });
      setIsInitializing(false);
    };
    void initialLoad();
    return () => { active = false; };
  }, [endpoint]);

  // Load active conversation details from backend
  useEffect(() => {
    const fetchActive = () => {
      if (activeConversationId) {
        fetchConversation(endpoint, activeConversationId).then((data) => {
          if (data) {
            const uiData = data as Conversation;
            setActiveConversation(uiData);
            setConversations((prev) =>
              prev.map((c) => (c.id === data.id ? uiData : c))
            );
          } else {
            setActiveConversation(null);
          }
        });
      } else {
        setActiveConversation(null);
      }
    };

    fetchActive();

    // Auto-sync on window focus (for iOS PWA wake up)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadConversationsList();
        fetchActive();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [activeConversationId, endpoint, loadConversationsList]);

  // Expose setConversations and intercept updates to the active conversation
  const handleConversationsUpdate = (
    updateFn: React.SetStateAction<Conversation[]>
  ) => {
    setConversations((prev) => {
      const next = typeof updateFn === "function" ? updateFn(prev) : updateFn;
      const updatedActive = next.find((c) => c.id === activeConversationId);
      if (updatedActive) {
        setActiveConversation(updatedActive);
      }
      return next;
    });
  };

  const handleNewChat = async () => {
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newConv: Conversation = {
      id: newId,
      title: "Nova Conversa",
      messages: [],
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversation(newConv);
    setActiveConversationId(newId);

    // Save to backend
    await createConversation(endpoint, newConv);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
  };

  const handleDeleteConversation = async (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
      } else {
        setActiveConversationId("");
      }
    }
    await deleteConversation(endpoint, id);
  };

  const handleClearAll = async () => {
    if (
      window.confirm(
        "Tem certeza de que deseja apagar permanentemente todas as conversas?"
      )
    ) {
      setConversations([]);
      setActiveConversationId("");
      await deleteAllConversations(endpoint);
    }
  };

  const handleSaveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
  };

  const activeMessages = activeConversation ? activeConversation.messages : [];

  return {
    settings,
    setSettings,
    handleSaveSettings,
    conversations,
    setConversations: handleConversationsUpdate,
    activeConversationId,
    setActiveConversationId,
    activeConversation,
    activeMessages,
    isInitializing,
    handleNewChat,
    handleSelectConversation,
    handleDeleteConversation,
    handleClearAll,
    reloadConversations: loadConversationsList,
  };
}
