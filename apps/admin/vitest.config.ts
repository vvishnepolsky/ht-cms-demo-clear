import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    passWithNoTests: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['node_modules', 'dist', 'e2e/**'],
    // Above test-setup.ts's asyncUtilTimeout (15_000) -- an equal testTimeout
    // gave RTL's budget zero headroom, so vitest killed the test first.
    testTimeout: 20_000,
  },
});
