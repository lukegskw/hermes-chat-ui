import { Check, X, Unlock, Lock } from "../Icons";
import { PendingApproval } from "../../types";
import styles from "./ApprovalCard.module.scss";

export type ApprovalCardProps = {
  approval: PendingApproval;
  onRespond: (choice: "once" | "session" | "always" | "deny") => void;
};

export const ApprovalCard = ({ approval, onRespond }: ApprovalCardProps) => {
  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <div className={styles.icon}>
          <Lock size={18} className={styles.textAmber} />
        </div>
        <div className={styles.title}>
          <h3>Ação Requer Aprovação</h3>
          <p>O agente solicitou permissão para executar uma ferramenta.</p>
        </div>
      </div>

      <div className={styles.details}>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Ferramenta:</span>
          <code className={styles.detailCode}>{approval.tool}</code>
        </div>
        <div className={styles.detailRow}>
          <span className={styles.detailLabel}>Comando:</span>
          <pre className={styles.detailCode}>
            {approval.command || approval.label || "N/A"}
          </pre>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          onClick={() => onRespond("once")}
          className={styles.btnAllow}
          title="Permitir a execução apenas desta vez"
        >
          <Check size={16} /> Permitir 1x
        </button>
        <button
          onClick={() => onRespond("session")}
          className={styles.btnSession}
          title="Permitir automaticamente durante esta sessão"
        >
          <Unlock size={16} /> Nesta Sessão
        </button>
        <button
          onClick={() => onRespond("always")}
          className={styles.btnAlways}
          title="Lembrar permissão e nunca mais perguntar para este comando"
        >
          <Unlock size={16} /> Sempre
        </button>
        <button
          onClick={() => onRespond("deny")}
          className={styles.btnDeny}
          title="Negar e cancelar execução"
        >
          <X size={16} /> Negar
        </button>
      </div>
    </div>
  );
};
