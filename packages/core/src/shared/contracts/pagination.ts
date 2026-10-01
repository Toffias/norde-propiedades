import { z } from 'zod';

/** Tamaños de página que ofrece la grilla del panel. */
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;
/** Ninguna query devuelve más filas que esto: pedir más es un error de validación. */
export const MAX_PAGE_SIZE = 100;
export const MAX_PAGE = 10_000;

export type SortDirection = 'asc' | 'desc';

export interface Sort<TField extends string> {
  readonly field: TField;
  readonly direction: SortDirection;
}

/**
 * Orden con lista blanca de columnas: `campo` ordena ascendente y `-campo` descendente (así viaja
 * en la URL). Cualquier otro valor es un error de validación;
 * sin valor, se usa `defaultSort`.
 */
export function sortSchema<const TField extends string>(
  fields: readonly [TField, ...TField[]],
  defaultSort: Sort<NoInfer<TField>>,
) {
  const values = fields.flatMap((field) => [field, `-${field}`]);
  return z
    .string()
    .refine((value) => values.includes(value), {
      message: `Orden inválido. Valores posibles: ${values.join(', ')}`,
    })
    .transform((value): Sort<TField> => {
      const descending = value.startsWith('-');
      const name = descending ? value.slice(1) : value;
      // El refine ya garantizó que `name` es uno de `fields`.
      const field = fields.find((candidate) => candidate === name) ?? defaultSort.field;
      return { field, direction: descending ? 'desc' : 'asc' };
    })
    .default(defaultSort);
}

/**
 * Base de toda query de listado: `page`, `pageSize` y `sort`. Cada query la extiende con sus
 * filtros (`pageQuerySchema(...).extend({ ... })`). Acepta strings para leer query params.
 */
export function pageQuerySchema<const TField extends string>(options: {
  readonly sortable: readonly [TField, ...TField[]];
  readonly defaultSort: Sort<NoInfer<TField>>;
}) {
  return z.object({
    page: z.coerce.number().int().min(1).max(MAX_PAGE).default(1),
    pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
    sort: sortSchema(options.sortable, options.defaultSort),
  });
}

/**
 * Selección de una acción masiva: los IDs marcados en la página, o "todos los que cumplen el
 * filtro" (viaja el filtro, nunca la lista completa de IDs).
 */
export function bulkSelectionSchema<TFilter extends z.ZodType>(filter: TFilter) {
  return z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('ids'), ids: z.array(z.uuid()).min(1).max(MAX_PAGE_SIZE) }),
    z.object({ kind: z.literal('filter'), filter }),
  ]);
}
