import { Component, type ErrorInfo, type ReactNode } from 'react';

type ErrorBoundaryProps = {
  children: ReactNode;
};

type ErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Dashboard render error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
          <div className="max-w-xl w-full rounded-xl border border-red-200 bg-white p-6 shadow-sm">
            <h1 className="text-xl font-semibold text-red-700">Dashboard failed to load</h1>
            <p className="mt-3 text-sm text-slate-700">
              A runtime error occurred while rendering the app. Please verify your environment
              variables and refresh.
            </p>
            {this.state.message && (
              <p className="mt-3 rounded bg-red-50 p-3 text-xs text-red-700 break-all">
                <strong>Error:</strong> {this.state.message}
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
