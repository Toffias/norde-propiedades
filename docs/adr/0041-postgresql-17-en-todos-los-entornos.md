# ADR 0041: PostgreSQL 17 en todos los entornos

- **Estado**: aceptada
- **Fecha**: 2026-10-21
- **Relacionada con**: ADR 0010 (tests de integración con Postgres local), ADR 0025 (e2e con Playwright).

## Contexto

`docs/arquitectura.md` pedía "PostgreSQL 17+" y decía que en desarrollo local se usaba 18. El CI (jobs `integration` y `e2e`) también corría con `postgres:18`.

El VPS de UAT ya tenía PostgreSQL instalado, compartido con otros proyectos: es **PostgreSQL 17.10** (Ubuntu 25.10), según `select version()` del 2026-10-21.

La migración `0036_required_branch_whatsapp` usaba `uuidv7()`, que es nativa recién desde PostgreSQL 18. En el CI pasaba, pero en UAT `drizzle-kit migrate` fallaba. Por eso uat no se pudo desplegar desde el 2026-10-19 (merges de #102 y #124).

## Decisión

- **La versión del proyecto es PostgreSQL 17**, la del VPS de UAT. El CI usa `postgres:17` en todos sus servicios.
- **Desarrollo local**: también 17. Mientras alguien use 18 en su máquina, el CI es el que avisa si una migración usa algo que 17 no tiene.
- **Las migraciones no usan funciones nativas de PostgreSQL 18**, por ejemplo `uuidv7()`. Si una migración necesita generar IDs (un backfill que audita, por ejemplo), usa una función temporal `pg_temp.uuidv7()` (como la `0036`) o `gen_random_uuid()` si el ID no tiene que ser v7. En el código, los IDs siguen saliendo de `IdGenerator`.
- Se corrigió la `0036` en lugar de agregar una migración nueva: nunca se pudo aplicar en UAT, y en las bases donde ya corrió (desarrollo, CI) Drizzle no la vuelve a ejecutar, porque decide por la fecha de la migración y no por su contenido.

## Consecuencias

- Pasar a PostgreSQL 18 es una decisión nueva: primero se actualiza el VPS, después el CI y este ADR.
- La versión del VPS queda anotada en `docs/deploy.md`. Si cambia, se actualizan los dos documentos.
