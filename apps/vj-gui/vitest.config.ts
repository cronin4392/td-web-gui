import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import solid from 'vite-plugin-solid';

// Solid needs its dev/browser export conditions during tests so the reactive
// runtime and JSX transform line up; vite-plugin-solid compiles the JSX.
export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
    conditions: ['development', 'browser'],
  },
  test: {
    environment: 'jsdom',
  },
});
