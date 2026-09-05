import { defineConfig } from 'vitest/config';

// The workspace root holds no source of its own — only the `scripts/` CLIs the
// apps share, which run in Node and are written as plain `.mjs`.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['scripts/**/*.test.mjs'],
  },
});
