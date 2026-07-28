import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { loadDotEnv } from './server/platform/env';
import { vjGuiEffectsApiPlugin } from './server/catalog/effects-api-plugin';
import { vjGuiLibraryApiPlugin } from './server/wordbank/library-api-plugin';
import { vjGuiScenesApiPlugin } from './server/catalog/scenes-api-plugin';
import { vjGuiThumbnailsPlugin } from './server/catalog/thumbnails-plugin';

loadDotEnv();

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    vjGuiLibraryApiPlugin(),
    vjGuiScenesApiPlugin(),
    vjGuiEffectsApiPlugin(),
    vjGuiThumbnailsPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@domain': fileURLToPath(new URL('./domain', import.meta.url)),
    },
  },
  server: {
    // The SQLite file (+ its -wal/-shm journals) is rewritten on every store
    // mutation. Without this, Vite's watcher sees those writes as project
    // file changes and force-reloads the page after every edit.
    watch: { ignored: ['**/data/**'] },
  },
});
