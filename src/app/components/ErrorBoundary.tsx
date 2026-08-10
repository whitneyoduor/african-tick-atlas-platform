import { Component, type ReactNode } from "react";

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

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] px-6 text-center">
          <h1 className="text-lg font-semibold" style={{ color: "#1C1917" }}>Something went wrong</h1>
          <p className="text-sm mt-1" style={{ color: "#57534E" }}>
            This section failed to load. Please reload the page and try again.
          </p>
          <p className="text-xs mt-3 max-w-lg break-all" style={{ color: "#A8A29E" }}>
            {this.state.error.message}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 text-xs font-medium px-4 py-2 rounded"
            style={{ background: "#134E4A", color: "#FFFFFF" }}
          >
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
