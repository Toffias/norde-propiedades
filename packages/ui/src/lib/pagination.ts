// Opciones del selector "Filas por página". La paginación es siempre del lado del servidor: el
// tamaño por defecto y el máximo los define el contract de cada query del core.

/** Listados. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;

/** Tablas dentro de una ficha de detalle. */
export const DETAIL_PAGE_SIZES = [5, 10, 25, 50] as const;

/** Cantidad total de páginas (al menos 1, así "Página 1 de 1" tiene sentido con 0 filas). */
export function pageCount(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
