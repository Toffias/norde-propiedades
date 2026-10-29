import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

// Genera `src/adapters/exports/pdf/fonts.generated.ts` con Plus Jakarta Sans (la tipografía del
// sitio) en base64. Las fuentes viajan dentro del código para que el PDF se arme igual en los
// tests, en `next dev` y en el build, sin depender de rutas de archivos (ADR 0051).
// Se corre con `pnpm --filter @norde/infra pdf:fonts` al actualizar @fontsource/plus-jakarta-sans.

const require = createRequire(import.meta.url);
const WEIGHTS = [400, 600, 800] as const;

const lines = WEIGHTS.map((weight) => {
  const path = require.resolve(
    `@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-${weight.toString()}-normal.woff`,
  );
  const base64 = readFileSync(path).toString('base64');
  return `  ${weight.toString()}: 'data:font/woff;base64,${base64}',`;
});

const source = `// Generado por scripts/generate-pdf-fonts.ts: no editar a mano.
// Plus Jakarta Sans (subset latin), SIL Open Font License 1.1.

export const PLUS_JAKARTA_SANS = {
${lines.join('\n')}
} as const;
`;

writeFileSync(new URL('../src/adapters/exports/pdf/fonts.generated.ts', import.meta.url), source);
