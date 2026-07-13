export type AuthSource = 'telegram' | 'development' | 'unavailable';

export interface AuthContext {
  source: AuthSource;
  initData: string;
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

  return { source: 'unavailable', initData: '' };
}
