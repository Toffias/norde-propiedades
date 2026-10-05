---
name: gestion-feature
description: Receta para construir una funcionalidad del panel de gestión de punta a punta respetando Clean Architecture: contract y dominio en @norde/core, puertos y Drizzle en @norde/infra, Server Actions y pantallas en apps/gestion, con grillas paginadas en el servidor, permisos, auditoría y tests. Usala al implementar un ABM, un listado, una ficha, una acción masiva o una exportación en apps/gestion.
---

# Funcionalidad del panel de punta a punta

Antes de empezar: `CLAUDE.md` (raíz), `apps/gestion/CLAUDE.md`, `packages/infra/CLAUDE.md` y `docs/arquitectura.md` §4–6. Si viene de la épica de Tokko, primero la skill `tokko-paridad`. Las reglas de esos archivos mandan sobre esta receta.

## Orden de trabajo

Se construye de adentro hacia afuera. Cada paso con sus tests antes de pasar al siguiente.

### 1. Contract (`packages/core/src/<modulo>/contracts/`)

- Schemas Zod del input de cada command y query, y los tipos de salida (DTOs planos).
- Las queries de listado extienden el schema común de paginación de `shared` (`page`, `pageSize` con máximo, `sort` de lista blanca). Si todavía no existe, lo crea la sub-issue #2: no inventes uno local.
- Es lo único del core que importan los componentes cliente (formularios con `zodResolver`).

### 2. Dominio (`<modulo>/domain/`)

- Aggregates, value objects (`Money`, `Phone`, `Email`), estados con transiciones, eventos de dominio.
- TypeScript puro: sin Zod, sin `new Date()` (el tiempo entra por parámetro), sin `process.env`.
- Unit test de cada regla nueva o modificada.

### 3. Casos de uso (`<modulo>/application/commands|queries/`)

- Una clase por archivo con `execute(input, actor): Promise<Result<T, E>>`. Errores esperados como unión discriminada.
- Primero `actor.can('<recurso>:<acción>')`, después las reglas de pertenencia ("de otros", "de su sucursal").
- **Commands**: `uow.run(...)` → cargar aggregate → regla en el dominio → guardar → `events.publish(...)` (outbox) → `audit.record(...)`, todo en la misma transacción.
- **Queries**: puerto de consulta propio que recibe `offset` / `limit` y devuelve `{ items, total }`; el caso de uso arma `Page<T>`. Patrón: `properties/application/queries/search-properties.ts`.
- Tests con fakes en memoria (`<modulo>/testing/`): camino feliz, cada error esperado y los permisos.
- Exportar lo nuevo en el `index.ts` del módulo. Otros módulos lo usan solo desde ahí.

### 4. Infra (`packages/infra/src/<modulo>/`)

- Tabla Drizzle en `db/schema/<modulo>.ts`; migración con `pnpm --filter @norde/infra db:generate`, compatible hacia atrás (expand, después contract).
- Índices para **cada** filtro y orden que ofrece la grilla.
- Repositorio y query que implementan los puertos. Validar con Zod las columnas `text` que mapean a uniones del core (ver `properties/drizzle-property-search-query.ts`).
- Test de integración `*.int.test.ts` contra Postgres real (`pnpm --filter @norde/infra test:int`): filtros, orden, paginación con más filas que una página, y que no se pierden ni repiten filas entre páginas.

### 5. Composition root (`apps/gestion/src/container.ts`)

- Instanciar infra y armar el caso de uso. Es el único archivo de la app que importa `@norde/infra`.

### 6. Presentación (`apps/gestion/src/features/<modulo>/` y `src/app/(panel)/...`)

- **Lectura**: la página (Server Component) parsea `searchParams` con el contract y llama a la query del container. Detalle en [grilla-paginada.md](grilla-paginada.md).
- **Escritura**: Server Action en `features/<modulo>/actions.ts`, en este orden: `Actor` de la sesión → validar con el contract → **un** caso de uso → mapear el `Result` a mensaje en español → `revalidatePath`. Sin `if` de negocio.
- Formularios con react-hook-form y el mismo schema del contract.
- **Alta y edición de entidades simples en panel lateral**, no en una pantalla propia (regla de `apps/gestion/CLAUDE.md`):
  - El panel se abre por la URL (`?panel=new` o `?panel=<id>&tab=...`, `lib/panel-params.ts`). La página parsea el param y carga los datos del panel en el servidor (`PanelData<T>`); la grilla los recibe y renderiza el panel.
  - Piezas: `usePanel()`, `EntitySheet`, `SheetLoading`, `SheetError` y `useLastDefined()` en `features/shared/components/entity-sheet.tsx`. El formulario va en `SheetBody scroll` y los botones en `SheetFooter`.
  - Ancho `default` para pocos campos; `wide` con pestañas, grillas o listas largas. Una grilla dentro del panel pagina con `panelPage`, sin tocar la página de la grilla de atrás.
  - Ejemplos: `branch-sheet.tsx` (simple), `team-sheet.tsx` (pestañas con grilla paginada), `role-sheet.tsx` (ancho, solo lectura sin permiso).
  - Las confirmaciones (borrar, restaurar, suspender) siguen siendo un diálogo.
  - **Si la entidad no entra cómoda en un panel** (muchas secciones, timeline, fotos, varias grillas: la ficha de una propiedad o de un cliente), **sugerile al usuario una pantalla propia antes de construirla** y esperá su respuesta.
- Componentes de `@norde/ui`, tokens semánticos, textos en español rioplatense con "vos".
- Acciones masivas y exportaciones: mandar el **filtro**, no la lista de IDs; correr por lotes o como job (pg-boss en `apps/gestion`, `src/jobs/`, ADR 0021).

### 7. Verificación y cierre

- `pnpm check` sin errores ni warnings nuevos (las violaciones de `eslint-plugin-boundaries` no se silencian).
- Probar en el navegador: mobile y desktop, tema claro y oscuro, página vacía, última página, filtros combinados.
- Actualizar `docs/modulos/03-sistema-gestion.md` si cambió el comportamiento, y marcar las casillas de la issue.

## Errores frecuentes

- Paginar u ordenar en memoria "porque son pocos". Todo listado pagina en la base.
- Un select o autocomplete que trae todos los clientes o propiedades: usar búsqueda paginada.
- Ocultar un botón como única barrera de permisos.
- Un `UPDATE` genérico por campo en la edición en línea: cada edición es un command del dominio con auditoría.
- Importar `../otro-modulo/domain/...` o hacer joins entre tablas de módulos distintos en un repositorio. Para listados que cruzan módulos, cada módulo expone su query y se compone en el caso de uso o en `reporting`.
- Loguear teléfonos, emails o DNI en claro.
