export function getTelegram(): Window['Telegram'] | undefined {
  return window.Telegram;
}

export function getWebApp() {
  return getTelegram()?.WebApp;
}

export function getTelegramUser() {
  return getWebApp()?.initDataUnsafe?.user;
}

export function isDark(): boolean {
  return getWebApp()?.colorScheme === 'dark';
}

export function initTelegram() {
  const webapp = getWebApp();
  if (webapp) {
    webapp.ready();
    webapp.expand();
  }
}

export function hapticFeedback() {
  getWebApp()?.HapticFeedback?.impactOccurred('light');
}

export function hapticSuccess() {
  getWebApp()?.HapticFeedback?.notificationOccurred('success');
}

export function hapticError() {
  getWebApp()?.HapticFeedback?.notificationOccurred('error');
}
