/** Página de resultados de una query. `page` empieza en 1. */
export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

/** Lo que devuelve un puerto de consulta: las filas pedidas y el total que cumple el filtro. */
export interface PageSlice<T> {
  readonly items: readonly T[];
  readonly total: number;
}

export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

/** Traduce la página pedida al `offset` / `limit` que recibe el puerto de consulta. */
export function toOffsetLimit({ page, pageSize }: PageRequest): {
  readonly offset: number;
  readonly limit: number;
} {
  return { offset: (page - 1) * pageSize, limit: pageSize };
}

/** Arma la `Page` a partir de lo que devolvió el puerto. */
export function toPage<T>(slice: PageSlice<T>, { page, pageSize }: PageRequest): Page<T> {
  return { items: slice.items, total: slice.total, page, pageSize };
}
