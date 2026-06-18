import { FC, useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../hooks/useTheme";
import { useEnvPassthrough } from "../../hooks/useEnvPassthrough";
import { isPushSupported, getNotificationPermission, requestNotificationPermission, subscribeToPush, unsubscribeFromPush, isSubscribedToPush } from "../../utils/pushNotifications";
import { SettingsIcon, MoonIcon, SunIcon, BellIcon, BellOffIcon } from "../Icons";
import styles from "./SettingsSheet.module.scss";

interface SettingsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsSheet: FC<SettingsSheetProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { envVars, updateEnvVar } = useEnvPassthrough();

  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  // Check push subscription state on mount
  useEffect(() => {
    if (isOpen && isPushSupported()) {
      isSubscribedToPush().then((subscribed) => {
        setPushEnabled(subscribed);
        if (subscribed) {
          setPushStatus(t("settings.push.status.subscribed"));
        }
      });
      const perm = getNotificationPermission();
      if (perm === 'denied') {
        setPushStatus(t("settings.push.status.blocked"));
      }
    }
  }, [isOpen, t]);

  const handlePushToggle = useCallback(async () => {
    if (pushLoading) return;
    setPushLoading(true);

    try {
      if (pushEnabled) {
        // Unsubscribe
        const success = await unsubscribeFromPush();
        if (success) {
          setPushEnabled(false);
          setPushStatus(t("settings.push.status.unsubscribed"));
        }
      } else {
        // Request permission and subscribe
        const permission = await requestNotificationPermission();
        if (permission === 'granted') {
          const subscription = await subscribeToPush();
          if (subscription) {
            setPushEnabled(true);
            setPushStatus(t("settings.push.status.subscribed"));
          } else {
            setPushStatus(t("settings.push.status.error"));
          }
        } else if (permission === 'denied') {
          setPushStatus(t("settings.push.status.blocked"));
        }
      }
    } catch {
      setPushStatus(t("settings.push.status.error"));
    } finally {
      setPushLoading(false);
    }
  }, [pushEnabled, pushLoading, t]);

  if (!isOpen) return null;

  const pushSupported = isPushSupported();

  return (
    <div className={styles.settingsSheet}>
      <h2 className={styles.title}>{t("settings.title")}</h2>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t("settings.appearance")}</div>
        <div className={styles.settingItem}>
          <span className={styles.settingLabel}>
            {theme === "dark" ? <MoonIcon size={20} /> : <SunIcon size={20} />}
            {t("settings.darkMode")}
          </span>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={theme === "dark"}
              onChange={toggleTheme}
            />
            <span className={styles.slider} />
          </label>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t("settings.notifications")}</div>
        <div className={styles.settingItem}>
          <span className={styles.settingLabel}>
            {pushEnabled ? <BellIcon size={20} /> : <BellOffIcon size={20} />}
            {t("settings.push.label")}
          </span>
          <div className={styles.pushToggleContainer}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                checked={pushEnabled}
                onChange={handlePushToggle}
                disabled={!pushSupported || pushLoading}
              />
              <span className={styles.slider} />
            </label>
          </div>
        </div>
        {pushStatus && (
          <div className={`${styles.pushStatus} ${!pushSupported ? styles.pushError : ''}`}>
            {pushStatus}
          </div>
        )}
        {!pushSupported && (
          <div className={`${styles.pushStatus} ${styles.pushWarning}`}>
            {t("settings.push.status.notSupported")}
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionTitle}>{t("settings.environment")}</div>
        <div className={styles.envGroup}>
          {Object.entries(envVars).map(([key, value]) => (
            <div key={key} className={styles.envInput}>
              <input
                type="text"
                value={key}
                disabled
                title={key}
              />
              <input
                type="text"
                value={value}
                onChange={(e) => updateEnvVar(key, e.target.value)}
                placeholder={key}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
