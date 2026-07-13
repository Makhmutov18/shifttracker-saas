import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  server: {
    port: 4174,
  },
  build: {
    outDir: 'dist',
  },
});
