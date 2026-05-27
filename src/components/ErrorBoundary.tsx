import { Component, ErrorInfo, ReactNode } from "react";
import { logger } from "../utils/logger";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
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
        <div style={{ padding: "2rem", color: "white", backgroundColor: "hsl(var(--bg-deep))", height: "100vh" }}>
          <h2 style={{ color: "hsl(0 80% 60%)" }}>Algo deu errado na interface.</h2>
          <p style={{ color: "hsl(var(--text-secondary))", marginTop: "1rem" }}>
            {this.state.error?.message}
          </p>
          <button 
            onClick={() => window.location.reload()}
            style={{
              marginTop: "2rem",
              padding: "0.5rem 1rem",
              backgroundColor: "hsl(var(--primary))",
              border: "none",
              borderRadius: "4px",
              color: "white",
              cursor: "pointer"
            }}
          >
            Recarregar Página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
