import { defineConfig } from 'vitest/config';

/**
 * Configuración base de Vitest.
 * - Unit tests: `src/**\/*.test.ts` y `.test.tsx` (se excluyen los de integración).
 * - Integración: `src/**\/*.int.test.ts`, con `createVitestConfig({ integration: true })`.
 * @param {{ integration?: boolean }} [options]
 */
export function createVitestConfig({ integration = false } = {}) {
  return defineConfig({
    test: {
      environment: 'node',
      include: integration ? ['src/**/*.int.test.ts'] : ['src/**/*.test.{ts,tsx}'],
      exclude: integration ? ['node_modules/**'] : ['node_modules/**', 'src/**/*.int.test.ts'],
      passWithNoTests: false,
      restoreMocks: true,
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.test.{ts,tsx}', 'src/**/testing/**', 'src/**/index.ts'],
      },
    },
  });
}
