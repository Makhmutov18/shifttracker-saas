import { useEffect, useState } from 'react';
import { isDark, initTelegram } from '../utils/telegram';

export function useTelegramTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    initTelegram();

    const checkTheme = () => {
      setDark(isDark());
    };

    checkTheme();

    // Listen for theme changes
    const interval = setInterval(checkTheme, 1000);
    return () => clearInterval(interval);
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