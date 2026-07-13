import React from 'react';
import { AlertTriangle } from 'lucide-react';

export class ErrorBoundary extends React.Component<React.PropsWithChildren, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error: unknown) { if (import.meta.env.DEV) console.error('Web admin runtime error', error); }
  render() {
    if (this.state.failed) return <div className="fatal-state"><AlertTriangle /><h1>Что-то пошло не так</h1><p>Обновите страницу или попробуйте позже.</p><button className="button primary" onClick={() => window.location.reload()}>Обновить</button></div>;
    return this.props.children;
  }
}
