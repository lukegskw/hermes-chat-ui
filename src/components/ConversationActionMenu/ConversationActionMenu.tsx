import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Edit2, MoreHorizontal, Trash2 } from "../Icons";
import { SelectField } from "../SelectField";
import type { SelectFieldItem, SelectFieldOption } from "../SelectField";
import styles from "./ConversationActionMenu.module.scss";

type ConversationActionMenuProps = {
  conversationTitle: string;
  modelLabel: string;
  modelValue: string;
  modelOptions: SelectFieldItem[];
  modelDisabled?: boolean;
  reasoningLabel: string;
  reasoningValue: string;
  reasoningOptions: SelectFieldOption[];
  reasoningDisabled?: boolean;
  busy?: boolean;
  disabled?: boolean;
  onSelectModel: (value: string) => Promise<boolean>;
  onSelectReasoning: (value: string) => Promise<boolean>;
  onRename: () => void;
  onDelete: () => void;
};

const MOBILE_QUERY = "(max-width: 768px)";

const useMobileLayout = () => {
  const [isMobile, setIsMobile] = useState(
    () => window.matchMedia(MOBILE_QUERY).matches,
  );

  useEffect(() => {
    const media = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
};

export const ConversationActionMenu = ({
  conversationTitle,
  modelLabel,
  modelValue,
  modelOptions,
  modelDisabled = false,
  reasoningLabel,
  reasoningValue,
  reasoningOptions,
  reasoningDisabled = false,
  busy = false,
  disabled = false,
  onSelectModel,
  onSelectReasoning,
  onRename,
  onDelete,
}: ConversationActionMenuProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const isMobile = useMobileLayout();

  const close = (restoreFocus = false) => {
    setIsOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!isOpen) return;

    requestAnimationFrame(() => overlayRef.current?.focus());

    const handleOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (
        triggerRef.current?.contains(target) ||
        overlayRef.current?.contains(target)
      ) {
        return;
      }
      close();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    };

    document.addEventListener("pointerdown", handleOutsidePointer, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handleOutsidePointer, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const selectModel = async (value: string) => {
    if (await onSelectModel(value)) close(true);
  };

  const selectReasoning = async (value: string) => {
    if (await onSelectReasoning(value)) close(true);
  };

  const overlay = isOpen && (
    <>
      {isMobile && (
        <div className={styles.backdrop} onPointerDown={() => close()} />
      )}
      <div
        ref={overlayRef}
        tabIndex={-1}
        className={`${styles.overlay} ${isMobile ? styles.mobileSheet : styles.desktopPopover}`}
        role="dialog"
        aria-modal={isMobile ? "true" : undefined}
        aria-label={t("chat.conversationOptions", {
          title: conversationTitle,
        })}
      >
        <div className={styles.runtimeFields}>
          <SelectField
            label={t("chat.model")}
            value={modelValue}
            options={modelOptions}
            onChange={(event) => void selectModel(event.target.value)}
            disabled={disabled || modelDisabled}
            ariaLabel={`${t("chat.chooseModel")}: ${modelLabel}`}
          />
          <SelectField
            label={t("chat.reasoningEffort")}
            value={reasoningValue}
            options={reasoningOptions}
            onChange={(event) => void selectReasoning(event.target.value)}
            disabled={disabled || reasoningDisabled}
            ariaLabel={`${t("chat.chooseReasoning")}: ${reasoningLabel}`}
          />
        </div>
        {busy && (
          <span className={styles.busyStatus} role="status">
            {t("chat.updatingRuntime")}
          </span>
        )}
        <div className={styles.divider} />
        <button
          type="button"
          className={styles.actionItem}
          onClick={() => {
            close();
            onRename();
          }}
          disabled={disabled}
        >
          <Edit2 size={17} aria-hidden="true" />
          <span>{t("chat.rename")}</span>
        </button>
        <div className={styles.divider} />
        <button
          type="button"
          className={`${styles.actionItem} ${styles.deleteItem}`}
          onClick={() => {
            close();
            onDelete();
          }}
          disabled={disabled}
        >
          <Trash2 size={17} aria-hidden="true" />
          <span>{t("chat.delete")}</span>
        </button>
      </div>
    </>
  );

  return (
    <div className={styles.root}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (!disabled) setIsOpen((current) => !current);
        }}
        className={styles.trigger}
        title={t("chat.moreOptions")}
        aria-label={t("chat.moreOptions")}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        disabled={disabled}
      >
        <MoreHorizontal size={20} />
      </button>
      {isOpen && (isMobile ? createPortal(overlay, document.body) : overlay)}
    </div>
  );
};
