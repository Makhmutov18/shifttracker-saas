import { useEffect, useState } from 'react';
import { isDark, initTelegram, getWebApp } from '../utils/telegram';

export function useTelegramTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    initTelegram();
    setDark(isDark());

    const webapp = getWebApp();
    if (webapp) {
      const handler = () => setDark(isDark());
      webapp.onEvent('themeChanged', handler);
      return () => webapp.offEvent('themeChanged', handler);
    }
  }, []);

  useEffect(() => {
    if (dark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [dark]);

  return { dark };
}