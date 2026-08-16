import { describe, expect, it } from "vitest";
import { decideChatScroll, restorePrependScrollTop } from "./scrollPolicy";

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
});
