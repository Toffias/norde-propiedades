# ADR 0017: Reglas de pertenencia en el dominio, con la sucursal en el `Actor`

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

Tokko tiene permisos globales del tipo "ver contactos de su sucursal u otras", "borrar propiedades de otros" o "editar emprendimientos de su sucursal". Un permiso solo no alcanza para decidirlos: hay que saber de quién es el registro y de qué sucursal es su dueño. #3 pide que "de otros" y "de su sucursal" se evalúen en el caso de uso, no solo con el permiso, y que un listado nunca filtre en memoria.

## Decisión

- **La regla vive en `identity/domain/ownership.ts`** y la usan los demás módulos desde la API pública de `identity`:
  - Cada acción sobre algo que tiene dueño declara una `OwnershipRule`: qué permiso cubre lo propio (`own`), lo de su sucursal (`branch`) y lo de cualquiera (`all`).
  - Las reglas de los permisos de Tokko están en `OWNERSHIP_RULES` (`clientsRead`, `propertiesUpdate`, `clientsDelete`, etc.).
- **`accessScope`** da el alcance más amplio que tiene el actor; **`canActOn`** lo evalúa contra un registro (`ownerId`, `ownerBranchId`); **`visibilityFilter`** lo convierte en un filtro que el puerto de consulta resuelve en SQL.
- Reglas:
  - Un registro sin dueño es "de otros": hace falta el alcance de sucursal o el de todos.
  - Sin sucursal asignada, un usuario queda en lo propio aunque tenga el permiso de sucursal.
  - Un actor de sistema no tiene cartera: con el permiso de la acción, alcanza todo.
  - Un `deny` corta el alcance más amplio (por ejemplo, `clients:*` con `deny clients:read-all` deja "su sucursal").
- **El `Actor` lleva la sucursal del usuario** (`branchId`, con `withBranch`), cargada por `ResolveSessionActor` desde `users.branch_id`. El dominio no depende del `Actor`: recibe cualquier objeto con `id`, `kind`, `branchId` y `can` (`OwnershipSubject`).

## Consecuencias

- Los casos de uso de clientes, propiedades, emprendimientos y tasaciones (#5 a #12) aplican `canActOn` en los commands y `visibilityFilter` en los listados, en lugar de repetir la lógica.
- Mientras Norde tenga una sola sucursal, "su sucursal" equivale a "todos los que tienen sucursal". Los registros sin dueño siguen requiriendo el alcance amplio.
- Se agregó al catálogo `clients:update-others` ("Editar contactos de otros"), que Tokko no tenía suelto y hacía falta para el alcance "todos" de la edición de contactos.
- El criterio de #3 "un agente sin `clients:export` no puede exportar" se cubre con el caso de uso de exportación de #8.
