import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { getApiUrl } from "../config/env";
import {
  ChatMessage,
  Conversation,
  NewConversationModelSelection,
  Settings,
} from "../types";
import {
  ApiError,
  assertSessionCapabilities,
  clearPendingSessionTarget,
  createConversation,
  deleteConversation,
  fetchConversation,
  fetchConversationMessagesPage,
  fetchConversations,
  readPendingSessionTarget,
  readSessionDeepLink,
  updateConversationTitle,
  updateConversationPinned,
  withoutSessionDeepLink,
} from "../utils";
import { mergeSessions, sortSessions } from "./sessionListReconciliation";
import { reconcileSessionMessages } from "./sessionMessageReconciliation";
import {
  buildHistoryWindow,
  hasMoreRawHistory,
  HISTORY_PAGE_SIZE,
  HISTORY_RAW_PAGE_SIZE,
  prependHistoryRows,
} from "./conversationHistory";

const PAGE_SIZE = 50;

const DEFAULT_SETTINGS: Settings = {
  systemPrompt: "",
  enableXmlCodeBlocks: true,
};

const messagesEqual = (left: ChatMessage[], right: ChatMessage[]) =>
  left.length === right.length &&
  JSON.stringify(left) === JSON.stringify(right);

const consumePendingSessionTarget = async (sessionId: string) => {
  try {
    await clearPendingSessionTarget(sessionId);
  } catch {
    // A storage failure must not undo a session that was already selected.
  }
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
  const [loadingMessagesFor, setLoadingMessagesFor] = useState("");
  const [loadingOlderMessagesFor, setLoadingOlderMessagesFor] = useState("");
  const [messageLoadError, setMessageLoadError] = useState("");
  const activeIdRef = useRef(activeConversationId);
  const sessionCountRef = useRef(0);
  const conversationsRef = useRef<Conversation[]>([]);
  const loadingOlderRef = useRef(false);
  const olderMessagesAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    activeIdRef.current = activeConversationId;
    olderMessagesAbortRef.current?.abort();
    loadingOlderRef.current = false;
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

  const fetchHistoryWindow = useCallback(
    async (
      id: string,
      requestedVisualCount: number,
      options: {
        rows?: Conversation["rawMessages"];
        offset?: number;
        totalRows?: number;
        hasOlder?: boolean;
        signal?: AbortSignal;
      } = {},
    ) => {
      let rows = options.rows ?? [];
      let offset = options.offset ?? 0;
      let hasOlder = options.hasOlder ?? true;
      let historyWindow = buildHistoryWindow(id, rows, requestedVisualCount);

      while (historyWindow.normalizedCount < requestedVisualCount && hasOlder) {
        const page = await fetchConversationMessagesPage(endpoint, id, {
          limit: HISTORY_RAW_PAGE_SIZE,
          offset,
          signal: options.signal,
        });
        if (options.signal?.aborted) {
          throw new DOMException("History loading aborted", "AbortError");
        }
        rows = prependHistoryRows(rows, page.rows);
        offset += page.returned;
        hasOlder =
          page.returned > 0 &&
          hasMoreRawHistory(
            offset,
            page.returned,
            HISTORY_RAW_PAGE_SIZE,
            options.totalRows,
          );
        historyWindow = buildHistoryWindow(id, rows, requestedVisualCount);
      }

      return { ...historyWindow, rows, offset, hasOlder };
    },
    [endpoint],
  );

  const reloadConversation = useCallback(
    async (id: string, signal?: AbortSignal, showSkeleton = false) => {
      const knownMessageCount = conversationsRef.current.find(
        (session) => session.id === id,
      )?.messageCount;
      if (showSkeleton) {
        setLoadingMessagesFor(id);
        setMessageLoadError("");
        setConversations((previous) =>
          previous.map((session) =>
            session.id === id &&
            !session.messages.some((message) => message.isGenerating)
              ? {
                  ...session,
                  messages: [],
                  rawMessages: [],
                  historyOffset: 0,
                  visibleMessageCount: 0,
                  historyLoaded: false,
                }
              : session,
          ),
        );
      }
      try {
        const history = await fetchHistoryWindow(id, HISTORY_PAGE_SIZE, {
          totalRows: knownMessageCount ?? undefined,
          signal,
        });
        setConversations((previous) =>
          previous.map((session) => {
            if (session.id !== id) return session;
            const reconciledMessages = reconcileSessionMessages(
              session.messages,
              history.messages,
            );
            return {
              ...session,
              messages: messagesEqual(session.messages, reconciledMessages)
                ? session.messages
                : reconciledMessages,
              rawMessages: history.rows,
              historyOffset: history.offset,
              hasOlderMessages: history.hasOlder,
              visibleMessageCount: history.visibleCount,
              historyLoaded: true,
            };
          }),
        );
        setSessionError("");
        if (activeIdRef.current === id) setMessageLoadError("");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
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
        if (activeIdRef.current === id) {
          setMessageLoadError(t("errors.sessionLoadFailed"));
        }
      } finally {
        setLoadingMessagesFor((current) => (current === id ? "" : current));
      }
    },
    [fetchHistoryWindow, handleApiError, t],
  );

  const selectConversationById = useCallback(
    async (
      id: string,
      options: {
        signal?: AbortSignal;
        candidates?: Conversation[];
      } = {},
    ): Promise<"selected" | "not_found"> => {
      try {
        const requested =
          options.candidates?.find((session) => session.id === id) ??
          conversationsRef.current.find((session) => session.id === id) ??
          ((await fetchConversation(
            endpoint,
            id,
            options.signal,
          )) as Conversation);
        if (options.signal?.aborted) {
          throw new DOMException("Navigation aborted", "AbortError");
        }
        setConversations((previous) =>
          sortSessions([
            requested,
            ...previous.filter((session) => session.id !== requested.id),
          ]),
        );
        setActiveConversationId(requested.id);
        setSessionError("");
        return "selected";
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          return "not_found";
        }
        throw error;
      }
    },
    [endpoint],
  );

  useEffect(() => {
    const controller = new AbortController();
    const initialize = async () => {
      const querySessionId = readSessionDeepLink(window.location.href);
      let pendingSessionId = "";
      try {
        pendingSessionId = (await readPendingSessionTarget())?.sessionId ?? "";
      } catch {
        // The URL remains a fallback when private browsing or an older WebKit
        // implementation makes IndexedDB unavailable.
      }
      const requestedSessionId = querySessionId || pendingSessionId;
      try {
        await assertSessionCapabilities(endpoint);
        const page = await loadFirstPage({ signal: controller.signal });
        if (requestedSessionId && !controller.signal.aborted) {
          let targetResolved = false;
          try {
            await selectConversationById(requestedSessionId, {
              signal: controller.signal,
              candidates: page.conversations as Conversation[],
            });
            targetResolved = true;
            await consumePendingSessionTarget(requestedSessionId);
          } catch (error) {
            if (!(error instanceof Error && error.name === "AbortError")) {
              handleApiError(error, t("errors.sessionLoadFailed"));
            }
          } finally {
            if (targetResolved) {
              window.history.replaceState(
                window.history.state,
                "",
                withoutSessionDeepLink(window.location.href),
              );
            }
          }
        }
      } catch (error) {
        handleApiError(error, t("errors.sessionLoadFailed"));
      } finally {
        if (!controller.signal.aborted) setIsInitializing(false);
      }
    };
    void initialize();
    return () => controller.abort();
  }, [endpoint, handleApiError, loadFirstPage, selectConversationById, t]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let controller: AbortController | null = null;
    const handleServiceWorkerMessage = (event: MessageEvent) => {
      const payload = event.data as Record<string, unknown> | null;
      if (
        !payload ||
        payload.type !== "open-session" ||
        typeof payload.sessionId !== "string" ||
        !payload.sessionId
      ) {
        return;
      }

      controller?.abort();
      controller = new AbortController();
      const sessionId = payload.sessionId;
      void selectConversationById(sessionId, { signal: controller.signal })
        .then(async () => {
          await consumePendingSessionTarget(sessionId);
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error && error.name === "AbortError")) {
            handleApiError(error, t("errors.sessionLoadFailed"));
          }
        });
    };

    navigator.serviceWorker.addEventListener(
      "message",
      handleServiceWorkerMessage,
    );
    return () => {
      controller?.abort();
      navigator.serviceWorker.removeEventListener(
        "message",
        handleServiceWorkerMessage,
      );
    };
  }, [handleApiError, selectConversationById, t]);

  useEffect(() => {
    if (!activeConversationId) return;
    const controller = new AbortController();
    // The state update happens after the external history request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reloadConversation(activeConversationId, controller.signal, true);
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
        return sortSessions([
          ...previous,
          ...(page.conversations as Conversation[]).filter(
            (session) => !existingIds.has(session.id),
          ),
        ]);
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
    async (selection?: NewConversationModelSelection) => {
      if (isCreatingChat) return;
      setIsCreatingChat(true);
      try {
        // The caller resolves Hermes' global default (or a sidebar preference)
        // to one concrete provider/model pair. Creation locks only this new
        // session and never writes Hermes' global configuration.
        const session = await createConversation(endpoint, { selection });
        setConversations((previous) =>
          sortSessions([
            session as Conversation,
            ...previous.filter((item) => item.id !== session.id),
          ]),
        );
        setActiveConversationId(session.id);
        setSessionError("");
        return session as Conversation;
      } catch (error) {
        handleApiError(error, t("errors.sessionCreateFailed"));
        toast.error(t("errors.sessionCreateFailed"));
        return null;
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
    async (id: string, newTitle: string): Promise<boolean> => {
      const title = newTitle.trim();
      if (!title) return false;
      const previousTitle =
        conversations.find((item) => item.id === id)?.title ?? "";
      setConversations((previous) =>
        previous.map((session) =>
          session.id === id ? { ...session, title } : session,
        ),
      );
      try {
        await updateConversationTitle(endpoint, id, title);
        return true;
      } catch (error) {
        setConversations((previous) =>
          previous.map((session) =>
            session.id === id ? { ...session, title: previousTitle } : session,
          ),
        );
        handleApiError(error, t("errors.sessionRenameFailed"));
        toast.error(t("errors.sessionRenameFailed"));
        return false;
      }
    },
    [conversations, endpoint, handleApiError, t],
  );

  const handlePinConversation = useCallback(
    async (id: string, pinned: boolean): Promise<boolean> => {
      const previousPinned =
        conversationsRef.current.find((item) => item.id === id)?.pinned ??
        false;
      setConversations((previous) =>
        sortSessions(
          previous.map((session) =>
            session.id === id ? { ...session, pinned } : session,
          ),
        ),
      );
      try {
        await updateConversationPinned(endpoint, id, pinned);
        return true;
      } catch (error) {
        setConversations((previous) =>
          sortSessions(
            previous.map((session) =>
              session.id === id
                ? { ...session, pinned: previousPinned }
                : session,
            ),
          ),
        );
        handleApiError(error, t("errors.sessionPinFailed"));
        toast.error(t("errors.sessionPinFailed"));
        return false;
      }
    },
    [endpoint, handleApiError, t],
  );

  const handleLoadOlderMessages = useCallback(async (): Promise<void> => {
    if (loadingOlderRef.current) return;
    const id = activeIdRef.current;
    const session = conversationsRef.current.find((item) => item.id === id);
    if (!session?.hasOlderMessages) return;

    loadingOlderRef.current = true;
    const controller = new AbortController();
    olderMessagesAbortRef.current = controller;
    setLoadingOlderMessagesFor(id);
    try {
      const requestedVisualCount =
        (session.visibleMessageCount ?? session.messages.length) +
        HISTORY_PAGE_SIZE;
      const history = await fetchHistoryWindow(id, requestedVisualCount, {
        rows: session.rawMessages,
        offset: session.historyOffset,
        totalRows: session.messageCount ?? undefined,
        hasOlder: session.hasOlderMessages,
        signal: controller.signal,
      });
      setConversations((previous) =>
        previous.map((item) =>
          item.id === id
            ? {
                ...item,
                messages: history.messages,
                rawMessages: history.rows,
                historyOffset: history.offset,
                hasOlderMessages: history.hasOlder,
                visibleMessageCount: history.visibleCount,
                historyLoaded: true,
              }
            : item,
        ),
      );
      setMessageLoadError("");
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      handleApiError(error, t("errors.sessionLoadFailed"));
      setMessageLoadError(t("errors.sessionLoadFailed"));
      toast.error(t("errors.sessionLoadFailed"));
    } finally {
      if (olderMessagesAbortRef.current === controller) {
        olderMessagesAbortRef.current = null;
        loadingOlderRef.current = false;
        setLoadingOlderMessagesFor((current) =>
          current === id ? "" : current,
        );
      }
    }
  }, [fetchHistoryWindow, handleApiError, t]);

  const handleSaveSettings = (newSettings: Settings) =>
    setSettings(newSettings);
  const activeConversation =
    conversations.find((session) => session.id === activeConversationId) ||
    null;
  const isLoadingMessages = loadingMessagesFor === activeConversationId;

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
    isLoadingOlderMessages: loadingOlderMessagesFor === activeConversationId,
    hasOlderMessages: activeConversation?.hasOlderMessages ?? false,
    messageLoadError,
    isCreatingChat,
    isLoadingMore,
    hasMoreConversations,
    sessionError,
    handleNewChat,
    handleSelectConversation: setActiveConversationId,
    handleDeleteConversation,
    handleRenameConversation,
    handlePinConversation,
    handleLoadMore,
    handleLoadOlderMessages,
    retryConversationMessages: () => {
      if (activeIdRef.current) {
        void reloadConversation(activeIdRef.current, undefined, true);
      }
    },
    reloadConversation,
  };
};
