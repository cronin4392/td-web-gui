import { defineConfig } from 'vite';
import solid from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import { vjGuiDbPlugin } from './server/plugin';
import { vjGuiScenesPlugin } from './server/scenes';

export default defineConfig({
  plugins: [solid(), tailwindcss(), vjGuiDbPlugin(), vjGuiScenesPlugin()],
  server: {
    // The SQLite file (+ its -wal/-shm journals) is rewritten on every store
    // mutation. Without this, Vite's watcher sees those writes as project
    // file changes and force-reloads the page after every edit.
    watch: { ignored: ['**/data/**'] },
  },
});
