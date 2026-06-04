import React, { useState } from "react";
import { Settings as SettingsIcon, X, Save } from "../Icons";
import { Settings } from "../../types";
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
  const [tempSystemPrompt, setTempSystemPrompt] = useState(
    settings.systemPrompt || "",
  );
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setTempSystemPrompt(settings.systemPrompt || "");
    }
  }

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
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
            Configurações
          </h3>
          <button type="button" onClick={onClose} className={styles.close}>
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className={styles.content}>
          <div className={styles.field}>
            <label className={styles.label}>Prompt de Sistema (Opcional)</label>
            <textarea
              className={styles.textareaLarge}
              value={tempSystemPrompt}
              onChange={(e) => setTempSystemPrompt(e.target.value)}
              placeholder="Digite seu prompt customizado aqui..."
            />
          </div>

          <button type="submit" className={styles.saveBtn}>
            <Save size={18} />
            Salvar Configurações
          </button>
        </form>
      </div>
    </>
  );
};
