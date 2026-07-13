export type AuthSource = 'telegram' | 'development' | 'web' | 'unavailable';

export interface AuthContext {
  source: AuthSource;
  initData: string;
}

let webSessionReady = false;

export function setWebSessionReady(ready: boolean): void {
  webSessionReady = ready;
}

export function clearWebSession(): void {
  webSessionReady = false;
}

export function resolveAuth(): AuthContext {
  const telegramInitData = window.Telegram?.WebApp?.initData?.trim() ?? '';
  if (telegramInitData) {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    return { source: 'telegram', initData: telegramInitData };
  }

  if (import.meta.env.DEV) {
    const developmentInitData = import.meta.env.VITE_TELEGRAM_INIT_DATA?.trim() ?? '';
    if (developmentInitData) {
      return { source: 'development', initData: developmentInitData };
    }
  }

  if (webSessionReady) return { source: 'web', initData: '' };

  return { source: 'unavailable', initData: '' };
}
