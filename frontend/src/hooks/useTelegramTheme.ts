import { useEffect, useMemo, useState } from 'react';
import { initTelegram, getWebApp } from '../utils/telegram';

export type ThemeMode = 'system' | 'light' | 'dark';

const THEME_STORAGE_KEY = 'shifttracker-theme-mode';

function readStoredThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }

  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (value === 'light' || value === 'dark' || value === 'system') {
    return value;
  }

  return 'system';
}

function getSystemDark(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTelegramTheme() {
  const [themeMode, setThemeModeState] = useState<ThemeMode>(() => readStoredThemeMode());
  const [systemDark, setSystemDark] = useState<boolean>(() => getSystemDark());
  const [telegramDark, setTelegramDark] = useState(false);

  useEffect(() => {
    initTelegram();

    const webapp = getWebApp();
    if (webapp) {
      setTelegramDark(webapp.colorScheme === 'dark');
      const handler = () => setTelegramDark(webapp.colorScheme === 'dark');
      webapp.onEvent('themeChanged', handler);
      return () => webapp.offEvent('themeChanged', handler);
    }
    return undefined;
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches);

    setSystemDark(media.matches);
    media.addEventListener('change', handler);

    return () => media.removeEventListener('change', handler);
  }, []);

  const resolvedDark = useMemo(() => {
    if (themeMode === 'dark') {
      return true;
    }
    if (themeMode === 'light') {
      return false;
    }
    const webapp = getWebApp();
    if (webapp) {
      return telegramDark;
    }
    return systemDark;
  }, [systemDark, telegramDark, themeMode]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = resolvedDark ? 'dark' : 'light';
    root.classList.toggle('dark', resolvedDark);
    window.localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [resolvedDark, themeMode]);

  const setThemeMode = (mode: ThemeMode) => {
    setThemeModeState(mode);
  };

  return { themeMode, setThemeMode, resolvedDark };
}
