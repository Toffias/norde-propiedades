/** Conventional Commits. Scope = módulo del core o app (ej. `feat(clients): ...`). */
export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'scope-enum': [
      2,
      'always',
      [
        // apps
        'web',
        'gestion',
        'agent',
        // paquetes
        'core',
        'infra',
        'agent-kit',
        'ui',
        'config',
        // módulos del core
        'shared',
        'properties',
        'clients',
        'rentals',
        'appraisals',
        'promotions',
        'conversations',
        'portals',
        'identity',
        'settings',
        'notifications',
        'audit',
        'reporting',
        // transversales
        'deps',
        'ci',
        'docs',
        'repo',
      ],
    ],
  },
};
