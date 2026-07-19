const cleanUrl = (value: string | undefined, fallback: string) => value?.trim() || fallback;

export const siteConfig = {
  appUrl: cleanUrl(import.meta.env.VITE_APP_URL, '/admin/'),
  leadUrl: cleanUrl(import.meta.env.VITE_LEAD_URL, '#pilot'),
  contactUrl: cleanUrl(import.meta.env.VITE_CONTACT_URL, '#pilot'),
} as const;

