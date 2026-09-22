import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['db/**/*.test.ts'] },
});
