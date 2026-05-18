import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    globals: false,
    env: {
      NEXT_PUBLIC_DIRECTUS_URL: 'http://localhost:8055',
    },
  },
  resolve: {
    alias: { '@': rootDir },
  },
});
