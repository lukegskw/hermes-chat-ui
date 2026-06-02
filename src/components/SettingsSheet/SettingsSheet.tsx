import React, { useState } from "react";
import { Settings as SettingsIcon, X, Save } from "../Icons";
import { Settings } from "../../types";
import "./SettingsSheet.css";

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
        className={`settings-sheet-backdrop ${isOpen ? "open" : ""}`}
        onClick={onClose}
      />
      <div className={`settings-sheet glass ${isOpen ? "open" : ""}`}>
        <div className="settings-sheet-header">
          <h3 className="settings-sheet-title">
            <SettingsIcon size={20} className="text-secondary" />
            Configurações
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="settings-sheet-close"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSaveSettings} className="settings-sheet-content">
          <div className="settings-field">
            <label className="settings-label">
              Prompt de Sistema (Opcional)
            </label>
            <textarea
              className="settings-textarea-large"
              value={tempSystemPrompt}
              onChange={(e) => setTempSystemPrompt(e.target.value)}
              placeholder="Digite seu prompt customizado aqui..."
            />
          </div>

          <button type="submit" className="settings-save-btn">
            <Save size={18} />
            Salvar Configurações
          </button>
        </form>
      </div>
    </>
  );
};
