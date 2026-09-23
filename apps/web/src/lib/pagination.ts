/** Una sola constante de tamaño de página para listar y para pre-generar (ver docs/modulos/02, sección 2). */
export const POSTS_PER_PAGE = 9;

export function totalPages(totalItems: number, perPage: number = POSTS_PER_PAGE): number {
  return Math.max(1, Math.ceil(totalItems / perPage));
}

/**
 * Número de página desde el segmento de la URL. Devuelve `undefined` si no es un entero ≥ 2:
 * la página 1 vive en la ruta base (`/blog`) y no se duplica en `/blog/pagina/1`.
 */
export function parsePageParam(value: string): number | undefined {
  if (!/^[1-9]\d{0,3}$/.test(value)) return undefined;
  const page = Number(value);
  return page >= 2 ? page : undefined;
}

export type PaginationItem =
  | { readonly type: 'page'; readonly page: number; readonly current: boolean }
  | { readonly type: 'ellipsis'; readonly key: string };

/** Páginas a mostrar: primera, última y las vecinas de la actual, con elipsis entre saltos. */
export function paginationItems(current: number, total: number): PaginationItem[] {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  const visible = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);

  const items: PaginationItem[] = [];
  let previous = 0;
  for (const page of visible) {
    if (page - previous > 1) items.push({ type: 'ellipsis', key: `gap-${previous}` });
    items.push({ type: 'page', page, current: page === current });
    previous = page;
  }
  return items;
}
