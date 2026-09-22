import { app, nextjs } from '@norde/config/eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(app({ tsconfigRootDir: import.meta.dirname }), nextjs());
