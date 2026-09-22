// Configuración compartida de ESLint para todo el monorepo.
// Cada paquete o app arma su eslint.config.js combinando estas piezas.
// Las reglas implementan lo exigido en CLAUDE.md y docs/arquitectura.md.

import js from '@eslint/js';
import nextPlugin from '@next/eslint-plugin-next';
import prettier from 'eslint-config-prettier';
import boundaries from 'eslint-plugin-boundaries';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const IGNORES = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
  '**/next-env.d.ts',
  '**/db/migrations/**',
  // Generados por Payload (se reescriben al actualizar Payload)
  '**/src/app/(payload)/**',
  '**/payload-types.ts',
  '**/importMap.js',
  '**/src/migrations/**',
];

const TEST_FILES = ['**/*.test.ts', '**/*.test.tsx'];
const CONFIG_FILES = ['*.config.{js,mjs,cjs,ts}', '**/*.config.{js,mjs,cjs,ts}'];

/** Selectores de `no-restricted-syntax` reutilizables (la regla no se fusiona entre bloques). */
const SYNTAX = {
  noDefaultExport: {
    selector: 'ExportDefaultDeclaration',
    message: 'Usá named exports (ver CLAUDE.md). Default export solo en archivos de framework.',
  },
  noProcessEnv: {
    selector: "MemberExpression[object.name='process'][property.name='env']",
    message: 'process.env solo se lee en src/config/env.ts (validado con Zod).',
  },
  // Solo `new Date()` sin argumentos lee la hora actual; derivar fechas (`new Date(ms)`) es válido.
  noNewDate: {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'En el core el tiempo sale del puerto Clock.',
  },
  noDateNow: {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'En el core el tiempo sale del puerto Clock.',
  },
  noCrypto: {
    selector: "MemberExpression[object.name='crypto']",
    message: 'En el core los IDs salen del puerto IdGenerator.',
  },
  noMathRandom: {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'El core debe ser determinístico: inyectá la fuente de aleatoriedad como puerto.',
  },
};

/**
 * Base para todo archivo TypeScript del monorepo: reglas estrictas con información de tipos.
 * @param {{ tsconfigRootDir: string }} options
 */
export function base({ tsconfigRootDir }) {
  return defineConfig(
    { ignores: IGNORES },
    js.configs.recommended,
    tseslint.configs.strictTypeChecked,
    tseslint.configs.stylisticTypeChecked,
    {
      languageOptions: {
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      linterOptions: { reportUnusedDisableDirectives: 'error' },
      rules: {
        'no-console': 'error',
        eqeqeq: ['error', 'always'],
        'prefer-const': 'error',
        'no-restricted-syntax': ['error', SYNTAX.noDefaultExport],
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/consistent-type-exports': 'error',
        '@typescript-eslint/no-import-type-side-effects': 'error',
        '@typescript-eslint/switch-exhaustiveness-check': 'error',
        '@typescript-eslint/prefer-readonly': 'error',
        '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
        ],
        '@typescript-eslint/ban-ts-comment': [
          'error',
          {
            'ts-expect-error': 'allow-with-description',
            'ts-ignore': true,
            'ts-nocheck': true,
            minimumDescriptionLength: 10,
          },
        ],
        '@typescript-eslint/consistent-type-assertions': [
          'error',
          { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
        ],
      },
    },
    {
      files: TEST_FILES,
      rules: {
        '@typescript-eslint/unbound-method': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
      },
    },
    {
      files: CONFIG_FILES,
      rules: { 'no-restricted-syntax': 'off' },
    },
    {
      files: ['**/*.{js,mjs,cjs}'],
      extends: [tseslint.configs.disableTypeChecked],
      languageOptions: { globals: globals.node },
    },
    prettier,
  );
}

/**
 * @norde/core: Clean Architecture por capas y límites entre módulos (eslint-plugin-boundaries).
 * @param {{ tsconfigRootDir: string }} options
 */
export function core({ tsconfigRootDir }) {
  const sameModule = '{{ from.element.captured.module }}';
  // Librerías puras permitidas en el dominio (ver packages/core/CLAUDE.md).
  const domainLibs = [
    { module: { origin: 'external', source: 'decimal.js' } },
    { module: { origin: 'external', source: 'libphonenumber-js' } },
  ];
  const zod = { module: { origin: 'external', source: 'zod' } };
  const inModule = (type) => ({ element: { type, captured: { module: sameModule } } });

  return defineConfig(
    base({ tsconfigRootDir }),
    {
      files: ['src/**/*.ts'],
      plugins: { boundaries },
      settings: {
        'import/resolver': { typescript: { alwaysTryTypes: true, project: tsconfigRootDir } },
        'boundaries/elements': [
          { type: 'shared-domain', pattern: 'src/shared/domain', exclusive: true },
          { type: 'shared-application', pattern: 'src/shared/application', exclusive: true },
          { type: 'shared-testing', pattern: 'src/shared/testing', exclusive: true },
          { type: 'domain', pattern: 'src/*/domain', capture: ['module'], exclusive: true },
          {
            type: 'application',
            pattern: 'src/*/application',
            capture: ['module'],
            exclusive: true,
          },
          { type: 'contracts', pattern: 'src/*/contracts', capture: ['module'], exclusive: true },
          { type: 'testing', pattern: 'src/*/testing', capture: ['module'], exclusive: true },
          { type: 'module-api', pattern: 'src/*', capture: ['module'] },
        ],
        'boundaries/files': [{ category: 'test', pattern: '**/*.test.ts' }],
      },
      rules: {
        'boundaries/no-unknown-files': 'error',
        'boundaries/dependencies': [
          'error',
          {
            default: 'disallow',
            // También se controlan las librerías externas (ej. nada de Zod en el dominio).
            checkAllOrigins: true,
            checkUnknownLocals: true,
            message:
              '{{ from.element.types }} ({{ from.element.captured.module }}) no puede depender de {{ to.element.types }}{{ to.module.source }}. Ver packages/core/CLAUDE.md.',
            policies: [
              // Dominio: solo su propio dominio, el shared kernel de dominio y librerías puras.
              {
                from: { element: { type: 'shared-domain' } },
                allow: { to: [{ element: { type: 'shared-domain' } }, ...domainLibs] },
              },
              {
                from: { element: { type: 'domain' } },
                allow: {
                  to: [inModule('domain'), { element: { type: 'shared-domain' } }, ...domainLibs],
                },
              },
              // Aplicación: su dominio, su aplicación, sus contracts, el shared kernel,
              // la API pública de otros módulos y Zod.
              {
                from: { element: { type: 'shared-application' } },
                allow: {
                  to: [
                    { element: { type: 'shared-domain' } },
                    { element: { type: 'shared-application' } },
                    zod,
                  ],
                },
              },
              {
                from: { element: { type: 'application' } },
                allow: {
                  to: [
                    inModule('domain'),
                    inModule('application'),
                    inModule('contracts'),
                    { element: { type: 'shared-domain' } },
                    { element: { type: 'shared-application' } },
                    {
                      element: {
                        type: 'module-api',
                        captured: { module: `!${sameModule}` },
                      },
                    },
                    zod,
                  ],
                },
              },
              // Contracts: importables desde el cliente de React. Solo Zod y otros contracts.
              {
                from: { element: { type: 'contracts' } },
                allow: { to: [{ element: { type: 'contracts' } }, zod] },
              },
              // API pública del módulo: re-exporta sus capas.
              {
                from: { element: { type: 'module-api' } },
                allow: {
                  to: [
                    inModule('domain'),
                    inModule('application'),
                    inModule('contracts'),
                    { element: { type: 'shared-domain' } },
                    { element: { type: 'shared-application' } },
                  ],
                },
              },
              // Fakes en memoria para tests.
              {
                from: { element: { types: { anyOf: ['testing', 'shared-testing'] } } },
                allow: {
                  to: [
                    inModule('domain'),
                    inModule('application'),
                    inModule('contracts'),
                    { element: { type: 'shared-domain' } },
                    { element: { type: 'shared-application' } },
                    { element: { type: 'shared-testing' } },
                    { element: { type: 'module-api' } },
                  ],
                },
              },
              // Los tests pueden usar cualquier cosa del core y Vitest.
              {
                from: { file: { categories: 'test' } },
                allow: {
                  to: [
                    { element: { type: '*' } },
                    { module: { origin: 'external', source: 'vitest' } },
                  ],
                },
              },
            ],
          },
        ],
        'no-restricted-syntax': [
          'error',
          SYNTAX.noDefaultExport,
          SYNTAX.noProcessEnv,
          SYNTAX.noNewDate,
          SYNTAX.noDateNow,
          SYNTAX.noCrypto,
          SYNTAX.noMathRandom,
        ],
      },
    },
    {
      // En dominio y aplicación no se permiten type assertions (`as`), salvo `as const`.
      files: ['src/**/domain/**/*.ts', 'src/**/application/**/*.ts'],
      ignores: TEST_FILES,
      rules: {
        '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      },
    },
    {
      // Los fakes y los tests pueden usar tiempo y aleatoriedad reales.
      files: [...TEST_FILES, 'src/**/testing/**/*.ts'],
      rules: { 'no-restricted-syntax': ['error', SYNTAX.noDefaultExport] },
    },
  );
}

/**
 * @norde/infra: implementaciones de puertos. Sin process.env (los secretos llegan por constructor).
 * @param {{ tsconfigRootDir: string }} options
 */
export function infra({ tsconfigRootDir }) {
  return library({ tsconfigRootDir });
}

/**
 * Librerías internas con dependencias externas (ej. @norde/agent-kit). Igual que infra:
 * la configuración llega por constructor, nunca de process.env.
 * @param {{ tsconfigRootDir: string }} options
 */
export function library({ tsconfigRootDir }) {
  return defineConfig(base({ tsconfigRootDir }), {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': ['error', SYNTAX.noDefaultExport, SYNTAX.noProcessEnv],
    },
  });
}

/**
 * Apps (capa de presentación): solo llaman casos de uso. La infraestructura se arma
 * únicamente en src/container.ts y el entorno se lee únicamente en src/config/env.ts.
 * @param {{ tsconfigRootDir: string }} options
 */
export function app({ tsconfigRootDir }) {
  return defineConfig(
    base({ tsconfigRootDir }),
    {
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        'no-restricted-syntax': ['error', SYNTAX.noDefaultExport, SYNTAX.noProcessEnv],
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@norde/infra', '@norde/infra/*'],
                message:
                  'La infraestructura solo se importa en src/container.ts (composition root).',
              },
              {
                group: ['drizzle-orm', 'drizzle-orm/*', 'pg'],
                message:
                  'La presentación no accede a la base: llamá un caso de uso de @norde/core.',
              },
              {
                group: [
                  '@norde/core/*/domain',
                  '@norde/core/*/domain/*',
                  '@norde/core/*/application/*',
                ],
                message: 'Importá solo la API pública del módulo (@norde/core/<module>).',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/container.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
    {
      files: ['src/config/env.ts'],
      rules: { 'no-restricted-syntax': ['error', SYNTAX.noDefaultExport] },
    },
    {
      // Archivos de configuración de frameworks (ej. src/payload.config.ts) exigen default export.
      files: CONFIG_FILES,
      rules: { 'no-restricted-syntax': ['error', SYNTAX.noProcessEnv] },
    },
  );
}

/**
 * Reglas de React (hooks). Para paquetes de componentes como @norde/ui.
 */
export function react() {
  return defineConfig(reactHooks.configs.flat.recommended);
}

/**
 * Reglas de Next.js y React. Se combina con `app()`.
 */
export function nextjs() {
  return defineConfig(
    {
      plugins: { '@next/next': nextPlugin },
      rules: {
        ...nextPlugin.configs.recommended.rules,
        ...nextPlugin.configs['core-web-vitals'].rules,
      },
    },
    react(),
    {
      // Next.js exige default export en páginas, layouts y archivos especiales.
      files: ['src/app/**/*.{ts,tsx}'],
      rules: { 'no-restricted-syntax': ['error', SYNTAX.noProcessEnv] },
    },
  );
}
