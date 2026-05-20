import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/sentiment/**', 'src/risk/**'],
      thresholds: { lines: 80, functions: 80, branches: 75 },
    },
  },
});
