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
├── app/api/webhooks/         # Endpoints públicos firmados (consultas del formulario web)
├── jobs/                     # Suscripciones a eventos del outbox (un caso de uso cada una)
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
- **Alta y edición en panel lateral**: crear o editar una entidad simple (usuario, rol, sucursal, equipo y similares) se hace en un **panel lateral** sobre su grilla, no en una pantalla dedicada ni en un modal.
  - Las acciones de la fila abren el panel; cada pestaña del panel agrupa una parte de la entidad (datos, miembros, permisos).
  - El panel vive en la URL (`?panel=<id>&tab=...`) y la página carga sus datos en el servidor. Patrón y piezas: skill `gestion-feature`.
  - Las confirmaciones (borrar, restaurar, suspender) siguen siendo un diálogo.
  - **Pantalla propia solo si la entidad lo amerita** (muchas secciones, timeline, fotos, varias grillas, como la ficha de una propiedad o un cliente). En ese caso, se le **sugiere al usuario antes de construirla** y se espera su respuesta.
- **Tablas y listados**: TanStack Table en modo manual (`manualPagination`, `manualSorting`, `manualFiltering`). Paginación, filtros y orden **siempre del lado del servidor**:
  - El estado vive en los query params de la URL (`?page=2&pageSize=50&sort=-updatedAt&agent=...`), así se puede compartir, recargar y volver atrás.
  - La página (Server Component) parsea `searchParams` con el contract Zod de la query y llama a la query del core, que devuelve `Page<T>`.
  - El cliente solo recibe las filas de la página actual. Nunca traer todo a memoria, ni para un select, un autocomplete o un kanban (cada columna pagina sola).
  - "Seleccionar todos" en acciones masivas manda **el filtro**, no la lista de IDs, y la acción corre por lotes o como job.
  - La grilla es `ServerDataTable` (`features/shared/components/server-data-table.tsx`) y los params se leen con `parseListParams` (`lib/list-params.ts`).
  - **Cabecera en dos franjas**, separadas por una línea: arriba, las acciones (switch de vista a la izquierda; importar, exportar, búsquedas, papelera y el alta, última, a la derecha); abajo, solo los filtros.
  - Patrón completo: `.claude/skills/gestion-feature/grilla-paginada.md`.
- **Papelera**: borrar es baja lógica. Toda entidad con papelera tiene su listado de borrados (paginado) con restaurar.
- **Autorización**:
  - La decide el caso de uso.
  - La UI puede ocultar acciones según permisos, pero **nunca** es la única barrera.
  - Toda ruta bajo `(panel)` exige sesión.
- **Errores**: cada tipo de error de un `Result` se mapea a un mensaje en español claro para el usuario. Los errores inesperados muestran un mensaje genérico y se loguean.
- **UI**: componentes de `@norde/ui` y tokens semánticos (`bg-card`, `text-foreground`). Sin colores hardcodeados. Verificar mobile y desktop, tema claro y oscuro.
- Textos de UI en español rioplatense ("vos").

## Jobs en segundo plano (ADR 0021)

Este proceso corre el relay del outbox y los workers de pg-boss de todo el sistema (variantes de fotos, PDF, importaciones, reglas y acciones masivas de oportunidades, ruteo de consultas, supresión y unificación).

- Arrancan una vez por proceso desde `instrumentation.ts` (`register()`), salvo con `JOBS_ENABLED=false`, y se arman en `startJobs()` de `container.ts`.
- Las suscripciones viven en `jobs/event-subscriptions.ts`: validan el payload con Zod y llaman **un** caso de uso con un actor de sistema de permisos acotados.
  - Un `Err` se loguea y no se reintenta; una excepción la reintenta pg-boss con backoff.
  - Los handlers son idempotentes.
  - **No se renombra una cola** (`<evento>.<suscripción>`): los jobs encolados con el nombre viejo quedarían huérfanos.
- Los cron, cuando existan, van en `jobs/schedules.ts`, con horario en `America/Argentina/Buenos_Aires`.
- Una sola instancia del panel en producción (`ecosystem.config.cjs`).
- Webhooks públicos (`app/api/webhooks/*`): firma sobre el body crudo, límite de tamaño, rate limit y validación con Zod. El proxy de sesión no los intercepta.

## Tests

- Server Actions críticas (crear o editar propiedad, cliente, contrato): test de integración.
- Flujos clave con Playwright: login, cargar propiedad, tomar una conversación del bot.
- Jobs: que cada suscripción llame el caso de uso correcto con el actor correcto y no reintente un `Err`.
- Webhooks: firma, validación, tamaño y rate limit.
