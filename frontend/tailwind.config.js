/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        tg: {
          bg: 'var(--tg-bg)',
          text: 'var(--tg-text)',
          hint: 'var(--tg-hint)',
          link: 'var(--tg-link)',
          primary: 'var(--tg-primary)',
          button: 'var(--tg-button)',
          buttonText: 'var(--tg-button-text)',
          secondaryBg: 'var(--tg-secondary-bg)',
        },
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
}