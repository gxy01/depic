import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@depic/core': new URL('../core/dist/index.js', import.meta.url).pathname,
      '@depic/web': new URL('../web/dist/index.js', import.meta.url).pathname,
    },
  },
});
