import { Component, type ErrorInfo, type ReactNode } from "react";
import { t } from "@/i18n";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
          <p className="text-lg font-semibold">{t.errorBoundary.title}</p>
          <p className="text-sm text-muted-foreground max-w-md">{t.errorBoundary.body}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            {t.errorBoundary.reload}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
