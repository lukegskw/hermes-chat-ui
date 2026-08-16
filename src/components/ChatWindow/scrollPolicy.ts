export type ChatScrollState = {
  sessionChanged: boolean;
  hasActiveSession: boolean;
  pendingInitialScroll: boolean;
  waitingForHistory: boolean;
  generationStarted: boolean;
  isGenerating: boolean;
  isNearBottom: boolean;
};

export type ChatScrollDecision = {
  scrollToBottom: boolean;
  pendingInitialScroll: boolean;
  isNearBottom: boolean;
};

export const isWaitingForInitialHistory = ({
  sessionChanged,
  isLoadingMessages,
  hasPersistedMessages,
  historyLoaded,
}: {
  sessionChanged: boolean;
  isLoadingMessages: boolean;
  hasPersistedMessages: boolean;
  historyLoaded: boolean;
}): boolean =>
  isLoadingMessages ||
  (sessionChanged && hasPersistedMessages && !historyLoaded);

export const restorePrependScrollTop = (
  previousScrollTop: number,
  previousScrollHeight: number,
  nextScrollHeight: number,
): number =>
  Math.max(0, previousScrollTop + (nextScrollHeight - previousScrollHeight));

export const decideChatScroll = ({
  sessionChanged,
  hasActiveSession,
  pendingInitialScroll,
  waitingForHistory,
  generationStarted,
  isGenerating,
  isNearBottom,
}: ChatScrollState): ChatScrollDecision => {
  let pending = sessionChanged ? hasActiveSession : pendingInitialScroll;
  let nearBottom = sessionChanged ? true : isNearBottom;

  if (pending && !waitingForHistory) {
    pending = false;
    nearBottom = true;
    return {
      scrollToBottom: true,
      pendingInitialScroll: pending,
      isNearBottom: nearBottom,
    };
  }

  if (generationStarted) nearBottom = true;
  return {
    scrollToBottom: isGenerating && nearBottom,
    pendingInitialScroll: pending,
    isNearBottom: nearBottom,
  };
};
