import { Check, X, Unlock, Lock } from "../Icons";
import { PendingApproval } from "../../types";
import { useTranslation } from "react-i18next";
import styles from "./ApprovalCard.module.scss";

export type ApprovalCardProps = {
  approval: PendingApproval;
  onRespond: (choice: "once" | "session" | "always" | "deny") => void;
};

export const ApprovalCard = ({ approval, onRespond }: ApprovalCardProps) => {
  const { t } = useTranslation();
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.icon}>
          <Lock size={18} className={styles.textAmber} />
        </div>
        <div className={styles.title}>
          <h3>{t("approval.title")}</h3>
          <p>{t("approval.description")}</p>
        </div>
      </div>

      <div className={styles.details}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t("approval.tool")}</span>
          <code className={styles.detailCode}>{approval.tool}</code>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>{t("approval.command")}</span>
          <pre className={styles.detailCode}>
            {approval.command || approval.label || "N/A"}
          </pre>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={() => onRespond("once")}
          className={styles.btnAllow}
          title={t("approval.allowOnceTitle")}
        >
          <Check size={16} /> {t("approval.allowOnce")}
        </button>
        <button
          onClick={() => onRespond("session")}
          className={styles.btnSession}
          title={t("approval.thisSessionTitle")}
        >
          <Unlock size={16} /> {t("approval.thisSession")}
        </button>
        <button
          onClick={() => onRespond("always")}
          className={styles.btnAlways}
          title={t("approval.alwaysTitle")}
        >
          <Unlock size={16} /> {t("approval.always")}
        </button>
        <button
          onClick={() => onRespond("deny")}
          className={styles.btnDeny}
          title={t("approval.denyTitle")}
        >
          <X size={16} /> {t("approval.deny")}
        </button>
      </div>
    </div>
  );
};
