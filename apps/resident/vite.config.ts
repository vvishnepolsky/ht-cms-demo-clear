/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

// Same-origin API: the app only ever talks to `/api/*` (identity + Verify
// Assist REST) and `/graphql`. In dev Vite proxies both to the demo server on
// :4000; in prod the server serves this bundle from the same origin.
const API_TARGET = process.env.VITE_DEV_API_TARGET || 'http://localhost:4000';

export default defineConfig({
  base: '/',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  // File types to support raw imports. Never add .css, .tsx, or .ts files to this.
  assetsInclude: ['**/*.svg', '**/*.csv'],
  server: {
    port: 5181,
    proxy: {
      '/api': { target: API_TARGET, changeOrigin: false },
      '/graphql': { target: API_TARGET, changeOrigin: false },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
  },
});
