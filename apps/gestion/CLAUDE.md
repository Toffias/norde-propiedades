# CLAUDE.md: apps/gestion

Panel interno del equipo de Norde (Next.js App Router). Detalle funcional en [docs/modulos/03-sistema-gestion.md](../../docs/modulos/03-sistema-gestion.md).

Reemplaza a **Tokko Broker**: el backlog es la épica [#1](https://github.com/Toffias/norde-propiedades/issues/1), una sub-issue por módulo. Para implementar una, usá las skills `tokko-paridad` (qué construir y qué no) y `gestion-feature` (cómo construirlo).

Se aplica además del `CLAUDE.md` de la raíz.

## Es una capa de presentación

Esta app **no tiene lógica de negocio**. Muestra datos y llama a casos de uso de `@norde/core`.

```
src/
├── app/                      # Rutas de Next.js (layouts, pages). Delgadas: componen features
├── features/<module>/        # Por módulo del core: components/, actions.ts, queries.ts
├── lib/                      # Utilidades de presentación (formatters, auth de sesión)
├── config/env.ts             # Único lugar que lee process.env
└── container.ts              # Composition root: arma casos de uso con infra. Único que importa @norde/infra
```

## Reglas

- **Server Actions** (`features/<module>/actions.ts`), siempre en este orden:
  1. Obtienen el `Actor` de la sesión.
  2. Validan el input con el **contract Zod** del core.
  3. Llaman **un** caso de uso.
  4. Mapean el `Result` a una respuesta de UI.
  5. Revalidan la ruta.
  - Nada más. Si una action tiene un `if` de negocio, está mal ubicada.
- **Lecturas** en Server Components, llamando queries del core a través de `container.ts`.
- **Componentes cliente**: nunca importan `@norde/core` salvo `contracts/` (schemas y tipos), ni `@norde/infra`.
- **Formularios**: react-hook-form + `zodResolver` con el **mismo** contract del core. No duplicar schemas.
- **Tablas y listados**: TanStack Table en modo manual (`manualPagination`, `manualSorting`, `manualFiltering`). Paginación, filtros y orden **siempre del lado del servidor**:
  - El estado vive en los query params de la URL (`?page=2&pageSize=50&sort=-updatedAt&agent=...`), así se puede compartir, recargar y volver atrás.
  - La página (Server Component) parsea `searchParams` con el contract Zod de la query y llama a la query del core, que devuelve `Page<T>`.
  - El cliente solo recibe las filas de la página actual. Nunca traer todo a memoria, ni para un select, un autocomplete o un kanban (cada columna pagina sola).
  - "Seleccionar todos" en acciones masivas manda **el filtro**, no la lista de IDs, y la acción corre por lotes o como job.
  - La grilla es `ServerDataTable` (`features/shared/components/server-data-table.tsx`) y los params se leen con `parseListParams` (`lib/list-params.ts`).
  - Patrón completo: `.claude/skills/gestion-feature/grilla-paginada.md`.
- **Papelera**: borrar es baja lógica. Toda entidad con papelera tiene su listado de borrados (paginado) con restaurar.
- **Autorización**:
  - La decide el caso de uso.
  - La UI puede ocultar acciones según permisos, pero **nunca** es la única barrera.
  - Toda ruta bajo `(panel)` exige sesión.
- **Errores**: cada tipo de error de un `Result` se mapea a un mensaje en español claro para el usuario. Los errores inesperados muestran un mensaje genérico y se loguean.
- **UI**: componentes de `@norde/ui` y tokens semánticos (`bg-card`, `text-foreground`). Sin colores hardcodeados. Verificar mobile y desktop, tema claro y oscuro.
- Textos de UI en español rioplatense ("vos").

## Tests

- Server Actions críticas (crear o editar propiedad, cliente, contrato): test de integración.
- Flujos clave con Playwright: login, cargar propiedad, tomar una conversación del bot.
