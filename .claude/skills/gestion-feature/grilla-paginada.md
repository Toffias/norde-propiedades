# Grilla paginada en el servidor

Patrón para **todo** listado del panel: grillas, kanban (por columna), bandejas, papeleras, historiales, feeds, selects con búsqueda. La regla está en `CLAUDE.md` ("Listados: siempre paginados en el servidor"); este archivo muestra cómo cumplirla.

Los nombres de los helpers comunes (`ListQuerySchema`, `toOffset`, el componente de grilla) los define la sub-issue #2. Hasta que existan, seguí esta forma y no crees variantes locales.

## Flujo

```
URL ?page=2&pageSize=50&sort=updatedAt:desc&agentId=...
  → page.tsx (Server Component): parsea searchParams con el contract
  → query del core (caso de uso): permisos + Page<T>
  → puerto de consulta: SQL con WHERE + ORDER BY + LIMIT/OFFSET y COUNT
  → la grilla (cliente) recibe solo las filas de la página y navega cambiando la URL
```

## 1. Contract de la query (core)

```ts
// packages/core/src/clients/contracts/index.ts
export const CLIENT_SORT_FIELDS = ['name', 'createdAt', 'updatedAt'] as const;

export const SearchClientsInputSchema = z.object({
  text: z.string().trim().min(1).max(100).optional(),
  agentId: z.uuid().optional(),
  ownersOnly: z.coerce.boolean().optional(),
  // Lista blanca: nunca un nombre de columna libre.
  sort: z.enum(CLIENT_SORT_FIELDS).default('updatedAt'),
  direction: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
```

- `z.coerce` porque los query params llegan como string.
- Máximo de `pageSize` siempre. 100 es un techo razonable para grillas; selects y autocompletes, 20.

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
    const result = await this.deps.clients.search({
      ...criteria,
      ...scope,
      offset: (page - 1) * pageSize,
      limit: pageSize,
    });
    return ok({ items: result.items, total: result.total, page, pageSize });
  }
}
```

## 3. Puerto e implementación (infra)

```ts
async search(c: ClientSearchCriteria) {
  const where = and(...this.filters(c));
  const order = c.direction === 'asc' ? asc(SORT_COLUMNS[c.sort]) : desc(SORT_COLUMNS[c.sort]);
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
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor();
  const input = SearchClientsInputSchema.safeParse(await searchParams);
  // Params inválidos (URL editada a mano): se vuelve a los valores por defecto, no se rompe la página.
  const result = await getContainer().searchClients.execute(input.success ? input.data : {}, actor);
  if (result.isErr()) return <SearchError error={result.error} />;
  return <ClientsGrid page={result.value} />;
}
```

## 5. Grilla (componente cliente)

- TanStack Table con `manualPagination`, `manualSorting` y `manualFiltering`; `rowCount = page.total`.
- Cambiar de página, orden o filtro = actualizar los query params con el router (`router.replace` con `useSearchParams`), lo que vuelve a renderizar la página en el servidor.
- Al cambiar un filtro, volver a `page=1`.
- Filtros de texto con debounce (300 ms).
- Estados: cargando, vacío ("No hay contactos con estos filtros"), error.
- Mobile: columnas secundarias ocultas o vista de tarjetas; la paginación sigue siendo la misma.

## Kanban, selects y acciones masivas

- **Kanban**: una query por columna con su propio `page` / `pageSize`; "cargar más" al hacer scroll pide la siguiente página de esa columna. Los contadores por columna salen de una query de conteo agrupado, no de traer las tarjetas.
- **Select / autocomplete** de clientes, propiedades o usuarios: query con `text` y `pageSize` chico. Nunca precargar la lista entera.
- **Acción masiva o exportación sobre "todos los que cumplen el filtro"**: la Server Action recibe el mismo input de búsqueda (sin `page`), y el caso de uso recorre por lotes o encola un job. La exportación se audita con el actor y los filtros.

## Tests

- Core: el caso de uso con un fake del puerto (permisos, scope del agente, validación de params).
- Infra (`*.int.test.ts`): sembrar más filas que una página y verificar `total`, que dos páginas consecutivas no se superponen, cada filtro y cada orden.
