import { defineConfig } from 'vitest/config';

// The `scripts/` CLIs are workspace-root code, with no package of their own to run them.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
});
