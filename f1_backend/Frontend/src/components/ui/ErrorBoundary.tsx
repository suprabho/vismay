import { Component, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback; receives the error + a reset callback */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Called when an error is caught (e.g. show a toast, revert a view toggle) */
  onError?: (error: Error) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (error) {
      if (this.props.fallback) return this.props.fallback(error, this.reset);
      return (
        <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
          <AlertTriangle size={28} className="text-f1-red mb-3" />
          <p className="font-mono text-xs text-neutral-600 mb-1">Something went wrong.</p>
          <p className="font-mono text-[10px] text-neutral-400 max-w-md break-words">{error.message}</p>
          <button
            onClick={this.reset}
            className="mt-4 px-4 py-2 font-mono text-[10px] uppercase tracking-widest bg-neutral-900 text-white hover:bg-neutral-700 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
