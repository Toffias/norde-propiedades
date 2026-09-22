import { createVitestConfig } from '@norde/config/vitest';
import { mergeConfig } from 'vitest/config';

// Tests de integración (`*.int.test.ts`) contra un Postgres real. Ver test/global-setup.ts.
export default mergeConfig(createVitestConfig({ integration: true }), {
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Comparten la base: un archivo por vez.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
