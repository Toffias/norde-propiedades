import type { z } from 'zod';

// Estado de las grillas en la URL: `?page=2&pageSize=50&sort=-createdAt&status=new`.
// La página (Server Component) lo parsea con el contract de la query del core; la grilla lo cambia
// navegando a la misma ruta con otros query params.

export type SearchParams = Record<string, string | string[] | undefined>;

export interface ParsedListParams<T> {
  readonly value: T;
  /** Params que no pasaron la validación y se reemplazaron por su valor por defecto. */
  readonly invalidKeys: readonly string[];
}

/**
 * Parsea los query params con el contract de la query. Un param inválido (URL editada a mano, un
 * `pageSize` mayor al máximo) no rompe la pantalla: se descarta, vuelve a su valor por defecto y
 * queda en `invalidKeys` para avisarlo.
 */
export function parseListParams<TSchema extends z.ZodType>(
  schema: TSchema,
  params: SearchParams,
): ParsedListParams<z.output<TSchema>> {
  const input: Record<string, unknown> = { ...params };
  const invalidKeys: string[] = [];

  for (;;) {
    const parsed = schema.safeParse(input);
    if (parsed.success) return { value: parsed.data, invalidKeys };

    const keys = parsed.error.issues
      .map((issue) => issue.path[0])
      .filter((key): key is string => typeof key === 'string' && key in input);
    // El error no es de un param puntual: ni los valores por defecto validan, es un bug del contract.
    if (keys.length === 0) throw parsed.error;
    for (const key of new Set(keys)) {
      Reflect.deleteProperty(input, key);
      invalidKeys.push(key);
    }
  }
}

export interface ListSort {
  readonly field: string;
  readonly direction: 'asc' | 'desc';
}

/** `campo` ordena ascendente y `-campo` descendente: el formato que acepta `sortSchema`. */
export function sortParam(sort: ListSort): string {
  return sort.direction === 'desc' ? `-${sort.field}` : sort.field;
}

export type ListParamChanges = Record<string, string | number | readonly string[] | undefined>;

/**
 * Query string con los cambios aplicados. Un valor vacío o `undefined` quita el param. Cambiar
 * cualquier cosa que no sea la página (filtro, orden, tamaño) vuelve a la página 1.
 */
export function withListParams(current: URLSearchParams, changes: ListParamChanges): string {
  const next = new URLSearchParams(current);
  const keys = Object.keys(changes);

  for (const key of keys) {
    const value = changes[key];
    if (value === undefined || value === '') {
      next.delete(key);
    } else if (typeof value === 'string' || typeof value === 'number') {
      // `set` mantiene la posición del param: la URL no cambia de orden al paginar.
      next.set(key, String(value));
    } else {
      next.delete(key);
      for (const item of value) if (item !== '') next.append(key, item);
    }
  }

  if (keys.some((key) => key !== 'page')) next.delete('page');
  if (next.get('page') === '1') next.delete('page');

  const query = next.toString();
  return query === '' ? '' : `?${query}`;
}
