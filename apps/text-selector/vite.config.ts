import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { textSelectorDbPlugin } from './server/plugin'

export default defineConfig({
  plugins: [solid(), tailwindcss(), textSelectorDbPlugin()],
  server: {
    // The SQLite file (+ its -wal/-shm journals) is rewritten on every store
    // mutation. Without this, Vite's watcher sees those writes as project
    // file changes and force-reloads the page after every edit.
    watch: { ignored: ['**/data/**'] },
  },
})
