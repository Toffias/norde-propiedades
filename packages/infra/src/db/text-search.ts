import { sql, type AnyColumn, type SQL } from 'drizzle-orm';

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Busca un texto libre dentro de una columna `search_text` (minúsculas y sin acentos, ver
 * `searchText` en `schema/columns.ts`). El término se normaliza con la misma función de la base, y
 * el índice GIN trigram de la columna resuelve el `like`.
 */
export function matchesSearchText(column: AnyColumn, term: string): SQL {
  return sql`${column} like '%' || core.search_normalize(${escapeLike(term)}) || '%'`;
}
