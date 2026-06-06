import React, { useState } from "react";
import { Settings as SettingsIcon, X, Save } from "../Icons";
import { Settings } from "../../types";
import { useTranslation } from "react-i18next";
import styles from "./SettingsSheet.module.scss";

export type SettingsSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  settings: Settings;
  onSaveSettings: (settings: Settings) => void;
};

export const SettingsSheet = ({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}: SettingsSheetProps) => {
  const { t, i18n } = useTranslation();
  const [tempSystemPrompt, setTempSystemPrompt] = useState(
    settings.systemPrompt || "",
  );
  const [tempLanguage, setTempLanguage] = useState(i18n.language || "en");
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setTempSystemPrompt(settings.systemPrompt || "");
      setTempLanguage(i18n.language || "en");
    }
  }

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (tempLanguage !== i18n.language) {
      i18n.changeLanguage(tempLanguage);
    }
    onSaveSettings({
      systemPrompt: tempSystemPrompt,
    });
    onClose();
  };

  return (
    <>
      <div
        className={`${styles.backdrop} ${isOpen ? styles.open : ""}`}
        onClick={onClose}
      />
      <div className={`${styles.sheet} ${isOpen ? styles.open : ""}`}>
        <div className={styles.header}>
          <h3 className={styles.title}>
            <SettingsIcon size={20} className={styles.textSecondary} />
            {t("settings.title")}
          </h3>
          <button type="button" onClick={onClose} className={styles.close}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className={styles.content}>
          <div className={styles.field}>
            <label className={styles.label}>{t("settings.language")}</label>
            <p className={styles.description}>
              {t("settings.languageDescription")}
            </p>
            <select
              className={styles.select}
              value={tempLanguage}
              onChange={(e) => setTempLanguage(e.target.value)}
            >
              <option value="en">English</option>
              <option value="pt-BR">Português (Brasil)</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>{t("settings.systemPrompt")}</label>
            <textarea
              className={styles.textareaLarge}
              value={tempSystemPrompt}
              onChange={(e) => setTempSystemPrompt(e.target.value)}
              placeholder={t("settings.systemPromptPlaceholder")}
            />
          </div>

          <button type="submit" className={styles.saveBtn}>
            <Save size={18} />
            {t("settings.save")}
          </button>
        </form>
      </div>
    </>
  );
};
