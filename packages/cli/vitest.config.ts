import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@depic/core': new URL('../core/src/index.ts', import.meta.url).pathname,
    },
  },
});
