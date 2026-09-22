import { base } from '@norde/config/eslint';
import { defineConfig } from 'eslint/config';

// Scripts de desarrollo (CLI): pueden escribir en consola.
export default defineConfig(base({ tsconfigRootDir: import.meta.dirname }), {
  rules: { 'no-console': 'off' },
});
