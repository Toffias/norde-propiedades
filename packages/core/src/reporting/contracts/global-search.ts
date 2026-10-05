// Contracts del buscador de la barra superior: busca a la vez en varios módulos.

import { z } from 'zod';

/** Dónde busca: contactos, propiedades, emprendimientos y agentes (usuarios del equipo). */
export const GLOBAL_SEARCH_KINDS = ['clients', 'properties', 'developments', 'agents'] as const;
export type GlobalSearchKind = (typeof GLOBAL_SEARCH_KINDS)[number];

/** Resultados por tipo: el resto se ve en el listado del módulo. */
export const GLOBAL_SEARCH_LIMIT = 5;
/** Con menos letras no se busca: los resultados no dirían nada. */
export const GLOBAL_SEARCH_MIN_LENGTH = 2;

export const GlobalSearchQuerySchema = z.object({
  q: z.string().trim().min(GLOBAL_SEARCH_MIN_LENGTH).max(100),
  /** Sin tipos elegidos se busca en todos. */
  kinds: z.array(z.enum(GLOBAL_SEARCH_KINDS)).max(GLOBAL_SEARCH_KINDS.length).default([]),
});
export type GlobalSearchQuery = z.input<typeof GlobalSearchQuerySchema>;

export interface GlobalSearchHit {
  readonly id: string;
  /** Código de referencia (propiedades y emprendimientos). */
  readonly code: string | undefined;
  readonly title: string;
  /** Empresa, dirección o email, según el tipo. */
  readonly detail: string | undefined;
}

export interface GlobalSearchGroup {
  readonly kind: GlobalSearchKind;
  /** Cuántos coinciden en total; `items` trae los primeros. */
  readonly total: number;
  readonly items: readonly GlobalSearchHit[];
}

/** Un grupo por tipo buscado, en el orden de `GLOBAL_SEARCH_KINDS`. Sin los que no puede ver. */
export interface GlobalSearchResult {
  readonly groups: readonly GlobalSearchGroup[];
}
