import { AsyncLocalStorage } from 'node:async_hooks';

import { PDF_COLORS } from './theme';

// El color de marca de Mi empresa (#175): `renderPdf` lo fija para el documento que arma y lo leen
// las piezas que van en ese color (títulos, badges, íconos). Los estilos fijos traen el rojo de Norde
// y se pisan con este. No es un contexto de React: el servidor de Next carga los renderers con el
// React de servidor, que no lo tiene. `AsyncLocalStorage` lo ata a cada armado, aunque haya varios
// PDF en paralelo.

const store = new AsyncLocalStorage<string>();

/** Corre el armado de un PDF con su color de marca. */
export function withBrandColor<T>(color: string, work: () => Promise<T>): Promise<T> {
  return store.run(color, work);
}

/** El color de marca del documento que se está armando (sin uno fijado, el rojo de Norde). */
export function brandColor(): string {
  return store.getStore() ?? PDF_COLORS.brand;
}
