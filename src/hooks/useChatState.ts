import { useState, useEffect, useCallback } from "react";
import {
  fetchConversations,
  fetchConversation,
  createConversation,
  deleteConversation,
  deleteAllConversations,
  updateConversationTitle,
} from "../utils";
import { Conversation, Settings, ChatMessage } from "../types";
import { getApiUrl } from "../config/env";

const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "",
};

export const useChatState = () => {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("hermes_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (
          parsed.systemPrompt &&
          parsed.systemPrompt.includes(
            'CRITICAL INSTRUCTION: Se uma ferramenta retornar um erro com o status "approval_required"',
          )
        ) {
          parsed.systemPrompt = "";
        }
        return parsed;
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
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
    setConversations((prev) => {
      const dbIds = new Set(list.map((c) => c.id));
      const mergedList = list.map((apiConv) => {
        const localConv = prev.find((c) => c.id === apiConv.id);
        if (localConv) {
          return {
            ...apiConv,
            modelId: apiConv.modelId || localConv.modelId,
            messages:
              localConv.messages.length > 0
                ? localConv.messages
                : apiConv.messages,
          } as Conversation;
        }
        return apiConv as Conversation;
      });
      // Keep local conversations that aren't in the DB yet
      const localOnly = prev.filter((c) => !dbIds.has(c.id));
      return [...localOnly, ...mergedList];
    });
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
    return () => {
      active = false;
    };
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
                const localEquivalent = prevConv.messages.find(
                  (m) => m.id === dbMsg.id,
                );
                // If the frontend is actively generating this message, it is the source of truth.
                if (localEquivalent && localEquivalent.isGenerating) {
                  return localEquivalent;
                }
                return dbMsg;
              });

              // Append purely local messages that aren't in the DB yet
              const dbMessageIds = new Set(
                mergedMessages.map((m: ChatMessage) => m.id),
              );
              const localOnlyMessages = prevConv.messages.filter((m) => {
                if (dbMessageIds.has(m.id)) return false;
                if (m.isGenerating) return true; // Always keep actively generating messages

                // Deduplicate if content exactly matches
                const isDuplicate = mergedMessages.some(
                  (dbMsg: ChatMessage) =>
                    dbMsg.role === m.role &&
                    (typeof m.content === "string" &&
                    typeof dbMsg.content === "string"
                      ? dbMsg.content === m.content
                      : JSON.stringify(dbMsg.content) ===
                        JSON.stringify(m.content)),
                );
                return !isDuplicate;
              });
              mergedMessages.push(...localOnlyMessages);

              const uiData = {
                ...data,
                modelId: data.modelId || prevConv.modelId,
                messages: mergedMessages,
              } as Conversation;
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
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [activeConversationId, endpoint, loadConversationsList]);

  const handleNewChat = async (modelId?: string) => {
    const newId = `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newConv: Conversation = {
      id: newId,
      title: "Nova Conversa",
      messages: [],
      modelId: modelId,
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

  const handleRenameConversation = async (id: string, newTitle: string) => {
    if (!newTitle.trim()) return;

    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title: newTitle } : c)),
    );
    await updateConversationTitle(endpoint, id, newTitle);
  };

  const handleClearAll = async () => {
    if (
      window.confirm(
        "Tem certeza de que deseja apagar permanentemente todas as conversas?",
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

  const activeConversation =
    conversations.find((c) => c.id === activeConversationId) || null;
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
    handleRenameConversation,
    handleClearAll,
    reloadConversations: loadConversationsList,
  };
};
