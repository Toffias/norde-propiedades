import { and, sql, type AnyColumn, type SQL } from 'drizzle-orm';

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Busca un texto libre dentro de una columna `search_text` (minúsculas y sin acentos, ver
 * `searchText` en `schema/columns.ts`). El término se parte en palabras y cada una tiene que
 * aparecer, en cualquier orden: "cosquin 1400" encuentra "Cosquín al 1400". Cada palabra se
 * normaliza con la misma función de la base, y el índice GIN trigram de la columna resuelve los
 * `like`.
 */
export function matchesSearchText(column: AnyColumn, term: string): SQL {
  const conditions = term
    .split(/\s+/)
    .filter((word) => word !== '')
    .map((word) => sql`${column} like '%' || core.search_normalize(${escapeLike(word)}) || '%'`);
  return and(...conditions) ?? sql`true`;
}
