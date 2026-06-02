import { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "../../utils";
import "./ErrorBoundary.css";

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
    // Update state so the next render will show the fallback UI.
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error({ error, errorInfo }, "Uncaught React rendering error");
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <h2 className="error-boundary-title">
            Algo deu errado na interface.
          </h2>
          <p className="error-boundary-message">{this.state.error?.message}</p>
          <button
            onClick={() => window.location.reload()}
            className="error-boundary-button"
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
