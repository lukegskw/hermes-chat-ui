import styles from "./ThinkingIndicator.module.scss";

type Props = {
  label: string;
  visible?: boolean;
};

export const ThinkingIndicator: React.FC<Props> = ({ visible, label }) => {
  if (!visible) return null;

  return (
    <div className={styles.thinkingIndicatorContainer}>
      <div className={styles.thinkingDots}>
        <div className={`${styles.thinkingDot} ${styles.dot1}`} />
        <div className={`${styles.thinkingDot} ${styles.dot2}`} />
        <div className={`${styles.thinkingDot} ${styles.dot3}`} />
      </div>
      <span className={styles.thinkingText}>{label}</span>
    </div>
  );
};
