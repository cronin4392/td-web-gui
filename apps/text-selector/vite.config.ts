import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'
import tailwindcss from '@tailwindcss/vite'
import { textSelectorDbPlugin } from './server/plugin'

export default defineConfig({
  plugins: [solid(), tailwindcss(), textSelectorDbPlugin()],
})
