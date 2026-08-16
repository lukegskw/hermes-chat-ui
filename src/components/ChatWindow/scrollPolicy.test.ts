import { describe, expect, it } from "vitest";
import {
  decideChatScroll,
  isWaitingForInitialHistory,
  restorePrependScrollTop,
} from "./scrollPolicy";

describe("chat scroll policy", () => {
  it("waits for initial history before scrolling to the latest message", () => {
    const waiting = decideChatScroll({
      sessionChanged: true,
      hasActiveSession: true,
      pendingInitialScroll: false,
      waitingForHistory: true,
      generationStarted: false,
      isGenerating: false,
      isNearBottom: true,
    });
    expect(waiting.scrollToBottom).toBe(false);
    expect(waiting.pendingInitialScroll).toBe(true);

    expect(
      decideChatScroll({
        sessionChanged: false,
        hasActiveSession: true,
        pendingInitialScroll: true,
        waitingForHistory: false,
        generationStarted: false,
        isGenerating: false,
        isNearBottom: true,
      }).scrollToBottom,
    ).toBe(true);
  });

  it("preserves the visible anchor when older content is prepended", () => {
    expect(restorePrependScrollTop(24, 800, 1_400)).toBe(624);
  });

  it("does not consume the initial scroll while cached history is refreshing", () => {
    expect(
      isWaitingForInitialHistory({
        sessionChanged: true,
        isLoadingMessages: false,
        hasPersistedMessages: true,
        historyLoaded: false,
      }),
    ).toBe(true);
    expect(
      isWaitingForInitialHistory({
        sessionChanged: false,
        isLoadingMessages: false,
        hasPersistedMessages: true,
        historyLoaded: true,
      }),
    ).toBe(false);
  });
});
