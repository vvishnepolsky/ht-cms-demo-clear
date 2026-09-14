import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served under /admin/ by the demo server in prod; in dev the SPA runs on its
// own port and proxies the same-origin API paths to apps/server (:4000).
export default defineConfig({
  base: '/admin/',
  plugins: [tailwindcss(), react()],
  server: {
    port: 5180,
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
      '/graphql': 'http://localhost:4000',
    },
  },
});
