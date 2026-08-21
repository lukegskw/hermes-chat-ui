import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import type { Conversation } from "../../types";
import { MessageSquare, MoreVertical, Pencil, Pin, Trash2, X } from "../Icons";
import styles from "./Sidebar.module.scss";

const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE_PX = 10;

const usesTouchActions = () =>
  window.matchMedia("(max-width: 768px), (pointer: coarse)").matches;

type ConversationListItemProps = {
  conversation: Conversation;
  active: boolean;
  disabled: boolean;
  onSelect: () => void;
  onPin: (pinned: boolean) => Promise<boolean>;
  onRename: (title: string) => Promise<boolean>;
  onDelete: () => Promise<boolean>;
};

export const ConversationListItem = ({
  conversation,
  active,
  disabled,
  onSelect,
  onPin,
  onRename,
  onDelete,
}: ConversationListItemProps) => {
  const { t } = useTranslation();
  const [menu, setMenu] = useState<"desktop" | "mobile" | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(conversation.title);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const pressTimerRef = useRef<number | null>(null);
  const pressOriginRef = useRef({ x: 0, y: 0 });
  const suppressClickRef = useRef(false);

  const clearPressTimer = () => {
    if (pressTimerRef.current !== null) {
      window.clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  };

  const closeMenu = () => {
    setMenu(null);
    setIsRenaming(false);
  };

  useEffect(() => {
    if (menu !== "desktop") return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        !rootRef.current?.contains(event.target as Node) &&
        !menuRef.current?.contains(event.target as Node)
      ) {
        closeMenu();
      }
    };
    const closeOnScroll = () => {
      if (menuRef.current?.contains(document.activeElement)) return;
      closeMenu();
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("resize", closeMenu);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("resize", closeMenu);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [menu]);

  useLayoutEffect(() => {
    if (isRenaming) renameInputRef.current?.focus({ preventScroll: true });
  }, [isRenaming]);

  useEffect(() => clearPressTimer, []);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      disabled ||
      !usesTouchActions() ||
      (event.target as Element).closest("button, input")
    ) {
      return;
    }
    clearPressTimer();
    pressOriginRef.current = { x: event.clientX, y: event.clientY };
    pressTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = true;
      setRenameValue(conversation.title);
      setMenu("mobile");
      pressTimerRef.current = null;
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (pressTimerRef.current === null) return;
    if (
      Math.hypot(
        event.clientX - pressOriginRef.current.x,
        event.clientY - pressOriginRef.current.y,
      ) > MOVE_TOLERANCE_PX
    ) {
      clearPressTimer();
    }
  };

  const submitRename = async (event: FormEvent) => {
    event.preventDefault();
    const title = renameValue.trim();
    if (!title) return;
    closeMenu();
    await onRename(title);
  };

  const source = (() => {
    const value = (conversation.source || "").toLowerCase();
    return ["hermes_browser", "tui", "cli"].includes(value)
      ? t("sidebar.userSource")
      : conversation.source || "Hermes";
  })();

  const actions = (
    <div
      ref={menuRef}
      className={menu === "mobile" ? styles.actionSheet : styles.actionPopover}
      style={menu === "desktop" ? popoverStyle : undefined}
      role="menu"
      aria-label={t("chat.conversationOptions", {
        title: conversation.title || t("common.newChat"),
      })}
      onClick={(event) => event.stopPropagation()}
    >
      {menu === "mobile" && (
        <div className={styles.actionSheetHeader}>
          <strong>{conversation.title || t("common.newChat")}</strong>
          <button
            type="button"
            onClick={closeMenu}
            aria-label={t("sidebar.closePanel")}
          >
            <X size={18} />
          </button>
        </div>
      )}
      {isRenaming ? (
        <form className={styles.renameForm} onSubmit={submitRename}>
          <input
            ref={renameInputRef}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            aria-label={t("chat.conversationName")}
          />
          <button type="submit" disabled={!renameValue.trim()}>
            {t("chat.saveRename")}
          </button>
        </form>
      ) : (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              closeMenu();
              void onPin(!conversation.pinned);
            }}
          >
            <Pin size={17} />
            {conversation.pinned ? t("chat.unpin") : t("chat.pin")}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => setIsRenaming(true)}
          >
            <Pencil size={17} />
            {t("chat.rename")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={styles.dangerAction}
            onClick={() => {
              closeMenu();
              void onDelete();
            }}
          >
            <Trash2 size={17} />
            {t("chat.delete")}
          </button>
        </>
      )}
    </div>
  );

  return (
    <div
      ref={rootRef}
      className={`${styles.conversationItem} ${active ? styles.active : ""}`}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      onClick={(event) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          event.preventDefault();
          return;
        }
        if (!disabled && !(event.target as Element).closest("button, input")) {
          onSelect();
        }
      }}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPressTimer}
      onPointerCancel={clearPressTimer}
      onContextMenu={(event) => {
        if (usesTouchActions()) event.preventDefault();
      }}
    >
      <div className={styles.conversationItemContent}>
        {conversation.pinned ? (
          <Pin
            size={15}
            className={styles.conversationIcon}
            aria-label={t("chat.pin")}
          />
        ) : (
          <MessageSquare size={15} className={styles.conversationIcon} />
        )}
        <div className={styles.conversationText}>
          <span className={styles.conversationTitle}>
            {conversation.title || t("common.newChat")}
          </span>
          <span className={styles.conversationSource}>{source}</span>
        </div>
        <button
          type="button"
          className={styles.conversationActionsTrigger}
          aria-label={t("chat.conversationOptions", {
            title: conversation.title || t("common.newChat"),
          })}
          aria-expanded={menu === "desktop"}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setPopoverStyle({
              left: Math.max(8, bounds.right - 180),
              top: Math.max(
                8,
                Math.min(bounds.bottom + 4, window.innerHeight - 180),
              ),
            });
            setRenameValue(conversation.title);
            setIsRenaming(false);
            setMenu((current) => (current === "desktop" ? null : "desktop"));
          }}
          disabled={disabled}
        >
          <MoreVertical size={18} />
        </button>
      </div>
      {menu === "desktop" && createPortal(actions, document.body)}
      {menu === "mobile" &&
        createPortal(
          <div
            className={styles.actionSheetBackdrop}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={closeMenu}
          >
            <div onPointerDown={(event) => event.stopPropagation()}>
              {actions}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
};
