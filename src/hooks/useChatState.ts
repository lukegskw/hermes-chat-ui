import { useState, useEffect } from 'react';
import { Conversation, Settings } from '../components/Sidebar';

const DEFAULT_SETTINGS: Settings = {
  systemPrompt:
    'Você é o Hermes, um assistente autônomo de inteligência artificial poderoso e prestativo. Responda em Português do Brasil.\n\nCRITICAL INSTRUCTION: Se uma ferramenta retornar um erro com o status "approval_required", você DEVE pedir permissão ao usuário imprimindo EXATAMENTE a seguinte string no final da sua resposta: [APPROVAL_REQUIRED: <comando_a_executar>]\nApós imprimir essa string, pare a geração e aguarde a resposta do usuário.',
};

export function useChatState() {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("hermes_settings");
    return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
  });

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem("hermes_conversations");
    return saved ? JSON.parse(saved) : [];
  });

  const [activeConversationId, setActiveConversationId] = useState<string>(() => {
    const saved = localStorage.getItem("hermes_active_conv_id");
    return saved || "";
  });

  useEffect(() => {
    localStorage.setItem("hermes_settings", JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem("hermes_conversations", JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    if (activeConversationId) {
      localStorage.setItem("hermes_active_conv_id", activeConversationId);
    } else {
      localStorage.removeItem("hermes_active_conv_id");
    }
  }, [activeConversationId]);

  const activeConversation = conversations.find((c) => c.id === activeConversationId);
  const activeMessages = activeConversation ? activeConversation.messages : [];

  const handleNewChat = () => {
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newConv: Conversation = {
      id: newId,
      title: "Nova Conversa",
      messages: [],
    };
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newId);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
  };

  const handleDeleteConversation = (id: string) => {
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      if (remaining.length > 0) {
        setActiveConversationId(remaining[0].id);
      } else {
        setActiveConversationId("");
      }
    }
  };

  const handleClearAll = () => {
    if (window.confirm("Tem certeza de que deseja apagar permanentemente todas as conversas?")) {
      setConversations([]);
      setActiveConversationId("");
    }
  };

  const handleSaveSettings = (newSettings: Settings) => {
    setSettings(newSettings);
  };

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
    handleNewChat,
    handleSelectConversation,
    handleDeleteConversation,
    handleClearAll,
  };
}
