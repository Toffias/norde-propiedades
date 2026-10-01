# Grilla paginada en el servidor

Patrón para **todo** listado del panel: grillas, kanban (por columna), bandejas, papeleras, historiales, feeds, selects con búsqueda. La regla está en `CLAUDE.md` ("Listados: siempre paginados en el servidor"); este archivo muestra cómo cumplirla.

Los helpers comunes son de la sub-issue #2. Usalos y no crees variantes locales:

| Pieza                                                     | Dónde                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------- |
| `pageQuerySchema`, `bulkSelectionSchema`, `MAX_PAGE_SIZE` | `@norde/core/shared/contracts`                                      |
| `toOffsetLimit`, `toPage`, `Page<T>`, `PageSlice<T>`      | `@norde/core/shared`                                                |
| `DataTable`, `DataTableSkeleton`, `DataTableError`        | `@norde/ui/components/data-table`                                   |
| `ServerDataTable`, `useListNavigation`                    | `apps/gestion/src/features/shared/components/server-data-table.tsx` |
| `parseListParams`, `withListParams`, `sortParam`          | `apps/gestion/src/lib/list-params.ts`                               |
| `messageForError`, `ErrorMessages`                        | `apps/gestion/src/lib/errors.ts`                                    |

Ejemplo vivo: `/dev/design-system/grilla-paginada`.

## Flujo

```
URL ?page=2&pageSize=50&sort=-updatedAt&agentId=...
  → page.tsx (Server Component): parsea searchParams con el contract
  → query del core (caso de uso): permisos + Page<T>
  → puerto de consulta: SQL con WHERE + ORDER BY + LIMIT/OFFSET y COUNT
  → la grilla (cliente) recibe solo las filas de la página y navega cambiando la URL
```

## 1. Contract de la query (core)

```ts
// packages/core/src/clients/contracts/index.ts
import { pageQuerySchema } from '../../shared/contracts';

export const CLIENT_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

export const SearchClientsInputSchema = pageQuerySchema({
  // Lista blanca: nunca un nombre de columna libre. En la URL: `sort=name` o `sort=-updatedAt`.
  sortable: CLIENT_SORT_FIELDS,
  defaultSort: { field: 'updatedAt', direction: 'desc' },
}).extend({
  text: z.string().trim().min(1).max(100).optional(),
  agentId: z.uuid().optional(),
  ownersOnly: z.coerce.boolean().optional(),
});
```

- `pageQuerySchema` trae `page` (default 1), `pageSize` (default 25, máximo `MAX_PAGE_SIZE` = 100: pedir más es error, no se recorta) y `sort` ya parseado a `{ field, direction }`. Acepta strings: sirve para query params.
- Selects y autocompletes: `.extend({ pageSize: z.coerce.number().int().min(1).max(20).default(20) })`.

## 2. Caso de uso (core)

```ts
export class SearchClients {
  constructor(private readonly deps: { readonly clients: ClientSearchQuery }) {}

  async execute(
    input: SearchClientsInput,
    actor: Actor,
  ): Promise<Result<Page<ClientRow>, SearchClientsError>> {
    if (!actor.can('clients:read')) return err({ type: 'Forbidden' });
    const parsed = SearchClientsInputSchema.safeParse(input);
    if (!parsed.success)
      return err({ type: 'InvalidSearch', issues: parsed.error.issues.map((i) => i.message) });

    const { page, pageSize, ...criteria } = parsed.data;
    // Las reglas de visibilidad (un agente ve lo suyo) las decide el caso de uso y viajan como criterio.
    const scope = actor.can('clients:read-all') ? {} : { agentId: actor.id };
    const slice = await this.deps.clients.search({
      ...criteria,
      ...scope,
      ...toOffsetLimit({ page, pageSize }),
    });
    return ok(toPage(slice, { page, pageSize }));
  }
}
```

## 3. Puerto e implementación (infra)

```ts
async search(c: ClientSearchCriteria) {
  const where = and(...this.filters(c));
  const column = SORT_COLUMNS[c.sort.field];
  const order = c.sort.direction === 'asc' ? asc(column) : desc(column);
  const [rows, totals] = await Promise.all([
    this.db.select(/* solo las columnas de la grilla */).from(clients).where(where)
      // Desempate por id: sin esto, filas con el mismo valor se repiten o se pierden entre páginas.
      .orderBy(order, asc(clients.id))
      .limit(c.limit)
      .offset(c.offset),
    this.db.select({ total: count() }).from(clients).where(where),
  ]);
  return { items: rows.map(toRow), total: totals[0]?.total ?? 0 };
}
```

- Siempre un orden total (columna + `id`).
- Seleccionar solo las columnas que muestra la grilla.
- Índice por cada filtro y orden. Texto libre: `pg_trgm` o `tsvector`, no `like '%x%'` sobre tablas grandes sin índice.
- Si una tabla crece mucho (feeds, historial, auditoría), usar paginación por cursor (keyset: `where (updated_at, id) < (...)`) en lugar de `OFFSET`, y omitir el `COUNT` exacto.

## 4. Página (apps/gestion)

```tsx
// src/app/(panel)/contactos/page.tsx
export default async function ContactsPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const actor = await requireActor();
  // Un param inválido (URL editada a mano) no rompe la página: vuelve a su valor por defecto y
  // queda en `invalidKeys` para avisarlo.
  const { value: input, invalidKeys } = parseListParams(
    SearchClientsInputSchema,
    await searchParams,
  );
  const result = await getContainer().searchClients.execute(input, actor);
  if (result.isErr())
    return <DataTableError message={messageForError(result.error, SEARCH_MESSAGES)} />;
  return <ClientsGrid page={result.value} sort={input.sort} invalidKeys={invalidKeys} />;
}
```

- `SEARCH_MESSAGES` se declara con `satisfies ErrorMessages<SearchClientsError>`: si el caso de uso suma un error, el compilador avisa.
- `loading.tsx` de la ruta: `DataTableSkeleton` dentro de la misma card.

## 5. Grilla (componente cliente)

Las columnas tienen funciones, así que viven en un componente cliente de la feature (`features/clients/components/clients-grid.tsx`):

```tsx
'use client';

const COLUMNS: readonly DataTableColumn<ClientRow>[] = [
  { id: 'name', header: 'Nombre', sortable: true, cell: (c) => c.name },
  { id: 'phone', header: 'Teléfono', cell: (c) => c.phone ?? EMPTY_VALUE },
  {
    id: 'updatedAt',
    header: 'Actualizado',
    sortable: true,
    showFrom: 'md',
    cell: (c) => formatDate(c.updatedAt),
  },
];

export function ClientsGrid({ page, sort }: ClientsGridProps) {
  return (
    <ServerDataTable
      label="Contactos"
      columns={COLUMNS}
      getRowId={getRowId}
      rows={page.items}
      total={page.total}
      page={page.page}
      pageSize={page.pageSize}
      sort={sort}
      toolbar={<ClientsFilters />}
      empty="No hay contactos con estos filtros."
    />
  );
}
```

- `ServerDataTable` navega con `router.replace` cambiando los query params (`withListParams`): cambiar filtro, orden o tamaño vuelve a `page=1`. La página se vuelve a renderizar en el servidor.
- Los filtros (`toolbar`) usan `useListNavigation().setParams({ text })`, con debounce de 300 ms para texto libre.
- Estados: `pending` atenúa las filas durante la navegación; `empty` sin filas; `DataTableError` si la query falla.
- Mobile: columnas secundarias con `showFrom`; la tabla scrollea dentro de la card.

## Kanban, selects y acciones masivas

- **Kanban**: una query por columna con su propio `page` / `pageSize`; "cargar más" al hacer scroll pide la siguiente página de esa columna. Los contadores por columna salen de una query de conteo agrupado, no de traer las tarjetas.
- **Select / autocomplete** de clientes, propiedades o usuarios: query con `text` y `pageSize` chico. Nunca precargar la lista entera.
- **Acción masiva o exportación**: `ServerDataTable` con `selectable` y `bulkActions`. La selección es `{ kind: 'ids', ids }` (filas de la página) o `{ kind: 'filter' }` ("todos los que cumplen el filtro"). El contract de la action usa `bulkSelectionSchema(filtroSinPagina)`: con `filter`, el caso de uso recorre por lotes o encola un job. La exportación se audita con el actor y los filtros.

## Tests

- Core: el caso de uso con un fake del puerto (permisos, scope del agente, validación de params).
- Infra (`*.int.test.ts`): sembrar más filas que una página y verificar `total`, que dos páginas consecutivas no se superponen, cada filtro y cada orden.
