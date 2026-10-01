# ADR 0015: Un solo usuario de base compartido; los permisos se deciden en el sistema

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

`docs/arquitectura.md` §10 proponía un rol de base de datos por proceso (web, agente, panel), con mínimo privilegio. #19 sumaba un usuario de base que solo pudiera insertar en `audit_log`, y otro aparte para la supresión de datos.

Los tres procesos más Payload comparten la misma base. Separar usuarios de Postgres obliga a mantener permisos sobre `core`, `payload` y `pgboss` en cada migración, y no protege nada que no protejan ya los casos de uso: lo que una persona puede hacer se decide en el sistema, con sus roles y permisos.

## Decisión

- Web (con Payload), agente y panel usan **un solo connection string**, con un usuario de base con permisos totales sobre la base.
- **Lo que puede hacer cada usuario del panel** lo deciden los roles y permisos del módulo `identity`, al estilo de ASP.NET Identity (`docs/modelo-de-datos.md`, "Roles y permisos del sistema"):
  - `roles` y `role_permissions`: roles editables con sus permisos `recurso:acción`.
  - `user_roles`: un usuario puede tener varios roles.
  - `user_permissions`: permisos propios de un usuario, que suman (`grant`) o quitan (`deny`).
  - Los casos de uso deciden con `actor.can(...)`.
- **`audit_log` sigue siendo solo de inserción, garantizado por código**: el puerto `AuditLog` solo tiene `record()` y ningún adaptador actualiza ni borra entradas. La única excepción es el caso de uso de supresión de datos de un cliente.

## Consecuencias

- El deploy no tiene que mantener permisos de base de datos: las migraciones y los procesos usan el mismo usuario.
- Un `UPDATE` o `DELETE` manual sobre `audit_log` (consola SQL, un script) no lo impide la base. Si hace falta, se puede sumar después un trigger que lo rechace, con un ADR.
- Si más adelante un proceso necesita menos privilegios (por ejemplo, la web), se agrega un usuario de base para ese proceso con su ADR.
