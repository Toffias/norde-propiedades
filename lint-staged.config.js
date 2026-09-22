// lint-staged para el monorepo: ESLint corre desde el directorio de cada paquete
// (ahí está su eslint.config.js); Prettier corre desde la raíz.

import { existsSync } from 'node:fs';
import path from 'node:path';

const PACKAGE_DIR = /^(?:apps|packages)\/[^/]+|^scripts(?=\/)/;

const quote = (file) => `"${file}"`;

/** @param {string[]} files */
function eslintByPackage(files) {
  const byPackage = new Map();

  for (const file of files) {
    const relative = path.relative(process.cwd(), file).replaceAll('\\', '/');
    const match = PACKAGE_DIR.exec(relative);
    // Solo paquetes con su propio eslint.config.js (ej. packages/config no tiene).
    if (!match || !existsSync(path.join(match[0], 'eslint.config.js'))) continue;
    const list = byPackage.get(match[0]) ?? [];
    list.push(file);
    byPackage.set(match[0], list);
  }

  return [...byPackage].map(
    ([dir, list]) =>
      `pnpm --dir ${dir} exec eslint --fix --max-warnings=0 --no-warn-ignored ${list.map(quote).join(' ')}`,
  );
}

export default {
  '*.{ts,tsx}': (files) => [
    ...eslintByPackage(files),
    `prettier --write ${files.map(quote).join(' ')}`,
  ],
  '*.{js,mjs,cjs,json,md,yml,yaml,css}': 'prettier --write',
};
