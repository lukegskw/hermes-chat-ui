import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getApiUrl } from "../config/env";
import { ChatMessage, Conversation, Settings } from "../types";
import {
  ApiError,
  assertSessionCapabilities,
  createConversation,
  deleteConversation,
  fetchConversationMessages,
  fetchConversations,
  updateConversationTitle,
} from "../utils";
import { reconcileSessionMessages } from "./sessionMessageReconciliation";

const PAGE_SIZE = 50;

const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "",
  enableXmlCodeBlocks: true,
};

const messagesEqual = (left: ChatMessage[], right: ChatMessage[]) =>
  left.length === right.length &&
  JSON.stringify(left) === JSON.stringify(right);

const mergeSessions = (
  previous: Conversation[],
  incoming: Conversation[],
  retainedId?: string,
): Conversation[] => {
  const previousById = new Map(
    previous.map((session) => [session.id, session]),
  );
  const incomingIds = new Set(incoming.map((session) => session.id));
  const merged = incoming.map((session) => {
    const existing = previousById.get(session.id);
    return existing
      ? {
          ...session,
          messages: existing.messages,
          modelId: session.modelId || existing.modelId,
        }
      : session;
  });
  const retained = retainedId
    ? previous.find(
        (session) => session.id === retainedId && !incomingIds.has(session.id),
      )
    : undefined;
  return retained ? [...merged, retained] : merged;
};

export const useChatState = () => {
  const { t } = useTranslation();
  const endpoint = getApiUrl();
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem("hermes_settings");
    if (!saved) return DEFAULT_SETTINGS;
    try {
      return JSON.parse(saved) as Settings;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [isInitializing, setIsInitializing] = useState(true);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMoreConversations, setHasMoreConversations] = useState(false);
  const [sessionError, setSessionError] = useState("");
  const activeIdRef = useRef(activeConversationId);
  const sessionCountRef = useRef(0);
  const conversationsRef = useRef<Conversation[]>([]);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    sessionCountRef.current = conversations.length;
    conversationsRef.current = conversations;
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem("hermes_settings", JSON.stringify(settings));
  }, [settings]);

  const handleApiError = useCallback((error: unknown, fallback: string) => {
    if (error instanceof Error && error.name === "AbortError") return;
    const message = error instanceof Error ? error.message : fallback;
    setSessionError(message);
  }, []);

  const loadFirstPage = useCallback(
    async (options: { signal?: AbortSignal } = {}) => {
      const page = await fetchConversations(endpoint, {
        limit: PAGE_SIZE,
        offset: 0,
        signal: options.signal,
      });
      setConversations((previous) =>
        mergeSessions(
          previous,
          page.conversations as Conversation[],
          activeIdRef.current,
        ),
      );
      setHasMoreConversations(page.hasMore);
      setSessionError("");
      setActiveConversationId((current) => {
        if (
          current &&
          page.conversations.some((session) => session.id === current)
        ) {
          return current;
        }
        return current || page.conversations[0]?.id || "";
      });
      return page;
    },
    [endpoint],
  );

  const refreshLoadedSessions = useCallback(
    async (signal?: AbortSignal) => {
      const desiredCount = Math.max(PAGE_SIZE, sessionCountRef.current);
      const loaded: Conversation[] = [];
      let offset = 0;
      let hasMore = true;

      while (offset < desiredCount && hasMore) {
        const page = await fetchConversations(endpoint, {
          limit: Math.min(200, desiredCount - offset),
          offset,
          signal,
        });
        loaded.push(...(page.conversations as Conversation[]));
        offset += page.conversations.length;
        hasMore = page.hasMore;
        if (page.conversations.length === 0) break;
      }

      setConversations((previous) =>
        mergeSessions(previous, loaded, activeIdRef.current),
      );
      setHasMoreConversations(hasMore);
      setSessionError("");
    },
    [endpoint],
  );

  const reloadConversation = useCallback(
    async (id: string, signal?: AbortSignal) => {
      try {
        const messages = await fetchConversationMessages(endpoint, id, signal);
        setConversations((previous) =>
          previous.map((session) => {
            if (session.id !== id) {
              return session;
            }
            const reconciledMessages = reconcileSessionMessages(
              session.messages,
              messages,
            );
            if (
              reconciledMessages === session.messages ||
              messagesEqual(session.messages, reconciledMessages)
            ) {
              return session;
            }
            return {
              ...session,
              messages: reconciledMessages,
              messageCount: reconciledMessages.length,
            };
          }),
        );
        setSessionError("");
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          const remaining = conversationsRef.current.filter(
            (session) => session.id !== id,
          );
          conversationsRef.current = remaining;
          setConversations(remaining);
          setActiveConversationId((current) =>
            current === id ? remaining[0]?.id || "" : current,
          );
          return;
        }
        handleApiError(error, t("errors.sessionLoadFailed"));
      }
    },
    [endpoint, handleApiError, t],
  );

  useEffect(() => {
    const controller = new AbortController();
    const initialize = async () => {
      try {
        await assertSessionCapabilities(endpoint);
        await loadFirstPage({ signal: controller.signal });
      } catch (error) {
        handleApiError(error, t("errors.sessionLoadFailed"));
      } finally {
        if (!controller.signal.aborted) setIsInitializing(false);
      }
    };
    void initialize();
    return () => controller.abort();
  }, [endpoint, handleApiError, loadFirstPage, t]);

  useEffect(() => {
    if (!activeConversationId) return;
    const controller = new AbortController();
    // The state update happens after the external history request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadConversation(activeConversationId, controller.signal);
    return () => controller.abort();
  }, [activeConversationId, reloadConversation]);

  useEffect(() => {
    let controller: AbortController | null = null;
    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") return;
      controller?.abort();
      controller = new AbortController();
      const signal = controller.signal;
      const activeId = activeIdRef.current;
      void Promise.all([
        refreshLoadedSessions(signal),
        activeId ? reloadConversation(activeId, signal) : Promise.resolve(),
      ]).catch((error: unknown) => {
        handleApiError(error, t("errors.sessionLoadFailed"));
      });
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      controller?.abort();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [handleApiError, refreshLoadedSessions, reloadConversation, t]);

  const handleLoadMore = useCallback(async () => {
    if (!hasMoreConversations || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const page = await fetchConversations(endpoint, {
        limit: PAGE_SIZE,
        offset: conversations.length,
      });
      setConversations((previous) => {
        const existingIds = new Set(previous.map((session) => session.id));
        return [
          ...previous,
          ...(page.conversations as Conversation[]).filter(
            (session) => !existingIds.has(session.id),
          ),
        ];
      });
      setHasMoreConversations(page.hasMore);
    } catch (error) {
      handleApiError(error, t("errors.sessionLoadFailed"));
      toast.error(t("errors.sessionLoadFailed"));
    } finally {
      setIsLoadingMore(false);
    }
  }, [
    conversations.length,
    endpoint,
    handleApiError,
    hasMoreConversations,
    isLoadingMore,
    t,
  ]);

  const handleNewChat = useCallback(
    async (modelId?: string) => {
      if (isCreatingChat) return;
      setIsCreatingChat(true);
      try {
        const session = await createConversation(endpoint, { modelId });
        setConversations((previous) => [
          session as Conversation,
          ...previous.filter((item) => item.id !== session.id),
        ]);
        setActiveConversationId(session.id);
        setSessionError("");
      } catch (error) {
        handleApiError(error, t("errors.sessionCreateFailed"));
        toast.error(t("errors.sessionCreateFailed"));
      } finally {
        setIsCreatingChat(false);
      }
    },
    [endpoint, handleApiError, isCreatingChat, t],
  );

  const handleDeleteConversation = useCallback(
    async (
      id: string,
      beforeDelete?: () => void | Promise<void>,
    ): Promise<boolean> => {
      const session = conversations.find((item) => item.id === id);
      if (!session) return false;
      const confirmed = window.confirm(
        t("chat.deleteConfirm", {
          title: session.title || t("common.newChat"),
          source: session.source || "Hermes",
        }),
      );
      if (!confirmed) return false;
      try {
        await beforeDelete?.();
        await deleteConversation(endpoint, id);
        const remaining = conversations.filter((item) => item.id !== id);
        setConversations(remaining);
        setActiveConversationId((current) =>
          current === id ? remaining[0]?.id || "" : current,
        );
        return true;
      } catch (error) {
        handleApiError(error, t("errors.sessionDeleteFailed"));
        toast.error(t("errors.sessionDeleteFailed"));
        return false;
      }
    },
    [conversations, endpoint, handleApiError, t],
  );

  const handleRenameConversation = useCallback(
    async (id: string, newTitle: string) => {
      const title = newTitle.trim();
      if (!title) return;
      const previousTitle =
        conversations.find((item) => item.id === id)?.title ?? "";
      setConversations((previous) =>
        previous.map((session) =>
          session.id === id ? { ...session, title } : session,
        ),
      );
      try {
        await updateConversationTitle(endpoint, id, title);
      } catch (error) {
        setConversations((previous) =>
          previous.map((session) =>
            session.id === id ? { ...session, title: previousTitle } : session,
          ),
        );
        handleApiError(error, t("errors.sessionRenameFailed"));
        toast.error(t("errors.sessionRenameFailed"));
      }
    },
    [conversations, endpoint, handleApiError, t],
  );

  const handleSaveSettings = (newSettings: Settings) =>
    setSettings(newSettings);
  const activeConversation =
    conversations.find((session) => session.id === activeConversationId) ||
    null;
  const isLoadingMessages = Boolean(
    activeConversation &&
    activeConversation.messages.length === 0 &&
    (activeConversation.messageCount ?? 0) > 0,
  );

  return {
    settings,
    setSettings,
    handleSaveSettings,
    conversations,
    setConversations,
    activeConversationId,
    activeConversation,
    activeMessages: activeConversation?.messages ?? [],
    isInitializing,
    isLoadingMessages,
    isCreatingChat,
    isLoadingMore,
    hasMoreConversations,
    sessionError,
    handleNewChat,
    handleSelectConversation: setActiveConversationId,
    handleDeleteConversation,
    handleRenameConversation,
    handleLoadMore,
    reloadConversation,
  };
};
