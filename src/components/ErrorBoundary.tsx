import { Component, type ReactNode } from "react";
import { Button } from "./ui";
import { Icon } from "./Icon";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-time crashes anywhere below it so a bug in one view
 * doesn't blank the whole app. Documents autosave independently of React
 * state (lib/store.ts persists on every change, not on unmount), so a
 * reload after a crash never loses work — the message says so explicitly,
 * since this is the one moment a non-technical user might otherwise
 * assume their notes are gone.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    console.error("[ErrorBoundary] render crash", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <Icon name="alert" size={26} className="text-danger" />
        <p className="text-base font-bold text-ink">Something went wrong</p>
        <p className="max-w-sm text-sm text-faint">
          Polity Studio hit an unexpected error. Your documents save automatically as you type, so nothing is lost —
          reloading will get you back to normal.
        </p>
        <Button variant="primary" onClick={() => location.reload()}>
          Reload Polity Studio
        </Button>
      </div>
    );
  }
}
