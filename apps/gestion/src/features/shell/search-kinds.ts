import { GLOBAL_SEARCH_KINDS, type GlobalSearchKind } from '@norde/core/reporting/contracts';

// Dónde busca el buscador de la barra superior. Es una preferencia de pantalla, no un dato: va en
// una cookie para que el servidor pinte los íconos ya marcados.

export const SEARCH_KINDS_COOKIE = 'norde-search-kinds';

/** La cookie es editable a mano: se quedan solo los tipos conocidos, en su orden. */
export function parseSearchKinds(value: string | undefined): GlobalSearchKind[] {
  if (value === undefined) return [];
  const chosen = value.split(',');
  return GLOBAL_SEARCH_KINDS.filter((kind) => chosen.includes(kind));
}

export function serializeSearchKinds(kinds: readonly GlobalSearchKind[]): string {
  return kinds.join(',');
}
