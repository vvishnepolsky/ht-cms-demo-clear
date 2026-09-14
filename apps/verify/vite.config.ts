import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  // Served under /verify on the single-service deploy (apps/server mounts the
  // built app there; CLEAR redirects back to <origin>/verify/flow?token=…&returned=1).
  base: '/verify/',
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  server: {
    // 5187: standalone Verify Assist hosted flow (resident portal :5181,
    // admin console :5180, API server :4000).
    port: 5187,
    host: true,
    proxy: {
      // All API traffic goes to @demo/server — no CORS in dev.
      '/api': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    passWithNoTests: true,
    exclude: ['node_modules', 'dist'],
    testTimeout: 20_000,
  },
});
