// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationListItem } from "./ConversationListItem";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      key === "chat.conversationOptions"
        ? `Options for ${values?.title}`
        : ({
            "sidebar.userSource": "User",
            "sidebar.closePanel": "Close panel",
            "chat.pin": "Pin",
            "chat.unpin": "Unpin",
            "chat.rename": "Rename",
            "chat.delete": "Delete",
            "chat.saveRename": "Save name",
            "chat.conversationName": "Conversation name",
            "common.newChat": "New Chat",
          }[key] ?? key),
  }),
}));

const setTouchLayout = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches }),
  });
};

const setup = () => {
  const actions = {
    onSelect: vi.fn(),
    onPin: vi.fn().mockResolvedValue(true),
    onRename: vi.fn().mockResolvedValue(true),
    onDelete: vi.fn().mockResolvedValue(true),
  };
  const rendered = render(
    <ConversationListItem
      conversation={{
        id: "session-1",
        title: "Pinned chat",
        source: "hermes_browser",
        messages: [],
      }}
      active={false}
      disabled={false}
      {...actions}
    />,
  );
  const item = rendered.container.firstElementChild;
  if (!(item instanceof HTMLElement))
    throw new Error("conversation item missing");
  return { ...rendered, ...actions, item };
};

beforeEach(() => setTouchLayout(false));
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

describe("conversation actions", () => {
  it("opens the desktop popover, pins, and closes after selection", () => {
    const { onPin } = setup();
    fireEvent.click(screen.getByLabelText("Options for Pinned chat"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin" }));
    expect(onPin).toHaveBeenCalledWith(true);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("closes the desktop popover on outside pointer or Escape", () => {
    setup();
    const trigger = screen.getByLabelText("Options for Pinned chat");
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("renames from the shared action surface", () => {
    const { onRename } = setup();
    fireEvent.click(screen.getByLabelText("Options for Pinned chat"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Rename" }));
    const input = screen.getByLabelText("Conversation name");
    fireEvent.change(input, { target: { value: "New name" } });
    fireEvent.submit(input.closest("form")!);
    expect(onRename).toHaveBeenCalledWith("New name");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("opens a bottom sheet after a touch long press", () => {
    vi.useFakeTimers();
    setTouchLayout(true);
    const { item, onSelect } = setup();
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole("menu").className).toContain("actionSheet");
    fireEvent.pointerUp(item);
    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("keeps short taps and cancels long press when the pointer scrolls", () => {
    vi.useFakeTimers();
    setTouchLayout(true);
    const { item, onSelect } = setup();
    fireEvent.pointerDown(item, { clientX: 10, clientY: 10 });
    fireEvent.pointerMove(item, { clientX: 10, clientY: 30 });
    act(() => vi.advanceTimersByTime(600));
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.pointerUp(item);
    fireEvent.click(item);
    expect(onSelect).toHaveBeenCalledOnce();
  });
});
