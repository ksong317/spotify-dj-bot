import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Built assets are served by FastAPI's StaticFiles mount at /static.
export default defineConfig({
  plugins: [react()],
  base: '/static/ui/',
  build: {
    outDir: fileURLToPath(new URL('../app/static/ui', import.meta.url)),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
});
