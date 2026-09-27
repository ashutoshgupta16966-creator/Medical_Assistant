import path from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
      '@workspace/api-client-react': path.resolve(import.meta.dirname, '../../lib/api-client-react/src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    // Use threads pool (worker_threads) instead of forks (child_process.fork)
    // to avoid Windows-specific startup timeouts in CI / low-resource environments.
    pool: 'threads',
  },
});