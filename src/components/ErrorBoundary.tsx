import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed && typeof parsed.error === 'string') {
        displayMessage = `Database ${parsed.operationType ?? 'operation'} failed: ${parsed.error}`;
      }
    } catch {
      // Plain error message
    }
    return {
      hasError: true,
      message: displayMessage,
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ArchWalk 3D ErrorBoundary caught:', error, info.componentStack);
  }

  handleReload = () => {
    this.setState({ hasError: false, message: '' });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen items-center justify-center bg-[#0d0f13] text-[#eceef2] p-6">
          <div className="max-w-md w-full rounded-xl bg-[#141820] border border-white/[0.1] p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-400" aria-hidden="true" />
              </div>
              <div>
                <h1 className="font-[family-name:var(--font-display)] text-base font-semibold text-white">
                  Studio encountered an error
                </h1>
                <p className="text-xs text-[#8a93a4]">
                  Your saved models remain safely stored in Firestore.
                </p>
              </div>
            </div>

            <p className="text-xs text-red-200/90 bg-red-950/40 border border-red-500/25 rounded-lg px-3 py-2.5 leading-relaxed break-words">
              {this.state.message}
            </p>

            <button
              type="button"
              onClick={this.handleReload}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-[#d99b4e] hover:bg-[#e3a85d] text-[#111318] text-sm font-semibold transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reload ArchWalk 3D</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
