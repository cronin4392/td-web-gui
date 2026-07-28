import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { loadDotEnv } from './server/env';
import { vjGuiEffectsApiPlugin } from './server/effects-api-plugin';
import { vjGuiLibraryApiPlugin } from './server/library-api-plugin';
import { vjGuiScenesApiPlugin } from './server/scenes-api-plugin';
import { vjGuiThumbnailsPlugin } from './server/thumbnails-plugin';

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
  server: {
    // The SQLite file (+ its -wal/-shm journals) is rewritten on every store
    // mutation. Without this, Vite's watcher sees those writes as project
    // file changes and force-reloads the page after every edit.
    watch: { ignored: ['**/data/**'] },
  },
});
