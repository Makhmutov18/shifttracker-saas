import React from 'react';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Frontend error boundary caught an error', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-tg-bg px-4 py-6 text-tg-text">
          <div className="mx-auto flex min-h-[calc(100vh-3rem)] max-w-lg items-center">
            <div className="surface-card w-full rounded-[1.4rem] p-5 text-center shadow-sm">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-500">
                <span className="h-5 w-5 rounded-full border-2 border-current" />
              </div>
              <h1 className="text-lg font-semibold text-tg-text">Что-то пошло не так</h1>
              <p className="mt-2 text-sm text-tg-hint">Обновите приложение или попробуйте позже.</p>
              {import.meta.env.DEV && this.state.error ? (
                <div className="mt-4 rounded-2xl bg-tg-bg px-4 py-3 text-left text-xs text-tg-hint">
                  <p className="font-medium text-tg-text">{this.state.error.message}</p>
                  {this.state.error.stack ? <pre className="mt-2 whitespace-pre-wrap break-words">{this.state.error.stack}</pre> : null}
                </div>
              ) : null}
              <button
                type="button"
                onClick={this.handleReload}
                className="mt-5 inline-flex items-center justify-center rounded-xl bg-tg-primary px-4 py-3 text-sm font-medium text-white"
              >
                Обновить
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
