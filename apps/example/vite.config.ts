import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';

export default defineConfig({
  plugins: [solid()],
  build: {
    // Two pages: the full tour and the minimal starting point. The dev server
    // finds both on its own; only `build` needs them listed.
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        minimal: resolve(__dirname, 'minimal.html'),
      },
    },
  },
});
