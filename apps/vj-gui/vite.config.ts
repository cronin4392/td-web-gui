import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { vjGuiLibraryApiPlugin } from './server/library-api-plugin';
import { vjGuiScenesApiPlugin } from './server/scenes-api-plugin';
import { vjGuiThumbnailsPlugin } from './server/thumbnails-plugin';

export default defineConfig({
  plugins: [
    solid(),
    tailwindcss(),
    vjGuiLibraryApiPlugin(),
    vjGuiScenesApiPlugin(),
    vjGuiThumbnailsPlugin(),
  ],
  server: {
    // The SQLite file (+ its -wal/-shm journals) is rewritten on every store
    // mutation. Without this, Vite's watcher sees those writes as project
    // file changes and force-reloads the page after every edit.
    watch: { ignored: ['**/data/**'] },
  },
});
