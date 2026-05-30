import { useState, useEffect, useCallback } from "react";
import { Conversation, Settings } from "../components/Sidebar";
import {
  fetchConversations,
  fetchConversation,
  createConversation,
  deleteConversation,
  deleteAllConversations,
  ChatMessage
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
      await loadConversationsList();
      if (active) {
        setIsInitializing(false);
      }
    };
    void initialLoad();
    return () => { active = false; };
  }, [loadConversationsList]);

  // Load active conversation details from backend
  useEffect(() => {
    const fetchActive = () => {
      if (activeConversationId) {
        fetchConversation(endpoint, activeConversationId).then((data) => {
          if (data) {
            setConversations((prev) => {
              const prevConv = prev.find((c) => c.id === data.id);
              if (!prevConv) {
                return [...prev, data as Conversation];
              }

              // SMART MERGE: Preserve frontend generating states and local-only messages
              const dbMessages = data.messages;
              const mergedMessages = dbMessages.map((dbMsg: ChatMessage) => {
                const localEquivalent = prevConv.messages.find(m => m.id === dbMsg.id);
                // If the frontend is actively generating this message, it is the source of truth.
                if (localEquivalent && localEquivalent.isGenerating) {
                  return localEquivalent;
                }
                return dbMsg;
              });

              // Append purely local messages that aren't in the DB yet
              const dbMessageIds = new Set(mergedMessages.map((m: ChatMessage) => m.id));
              const localOnlyMessages = prevConv.messages.filter(m => !dbMessageIds.has(m.id));
              mergedMessages.push(...localOnlyMessages);

              const uiData = { ...data, messages: mergedMessages } as Conversation;
              return prev.map((c) => (c.id === data.id ? uiData : c));
            });
          }
        });
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



  const handleNewChat = async () => {
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newConv: Conversation = {
      id: newId,
      title: "Nova Conversa",
      messages: [],
    };

    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);

    // Save to backend
    await createConversation(endpoint, newConv);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
  };

  const handleDeleteConversation = async (id: string) => {
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    
    if (activeConversationId === id) {
      setActiveConversationId(remaining.length > 0 ? remaining[0].id : "");
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

  const activeConversation = conversations.find(c => c.id === activeConversationId) || null;
  const activeMessages = activeConversation ? activeConversation.messages : [];

  return {
    settings,
    setSettings,
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
    reloadConversations: loadConversationsList,
  };
}
