import { readFileSync, writeFileSync } from 'node:fs';

// Genera `src/adapters/exports/pdf/portal-logos.generated.ts` con los logos de los portales en
// base64, los mismos del panel (`apps/gestion/public/portals`). Viajan dentro del código, como las
// fuentes, para que el reporte al propietario se arme igual en los tests y en el build (ADR 0051).
// Se corre con `pnpm --filter @norde/infra pdf:portal-logos` al cambiar un logo.

const PORTALS = ['mercadolibre', 'zonaprop'] as const;

const lines = PORTALS.map((portal) => {
  const file = new URL(`../../../apps/gestion/public/portals/${portal}.png`, import.meta.url);
  // El valor en su propia línea, como lo deja Prettier: regenerarlo no ensucia el formato.
  return `  ${portal}:
    'data:image/png;base64,${readFileSync(file).toString('base64')}',`;
});

const source = `// Generado por scripts/generate-pdf-portal-logos.ts: no editar a mano.

export const PORTAL_LOGOS = {
${lines.join('\n')}
} as const;
`;

writeFileSync(
  new URL('../src/adapters/exports/pdf/portal-logos.generated.ts', import.meta.url),
  source,
);
