import { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "../../utils";
import styles from "./ErrorBoundary.module.scss";

type Props = {
  children?: ReactNode;
};

type State = {
  hasError: boolean;
  error?: Error;
};

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error({ error, errorInfo }, "Uncaught React rendering error");
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className={styles.container}>
          <h2 className={styles.title}>Algo deu errado na interface.</h2>
          <p className={styles.message}>{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className={styles.button}
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
