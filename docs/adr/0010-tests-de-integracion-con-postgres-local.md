# ADR 0010: Tests de integración contra un Postgres real, sin Testcontainers por ahora

- **Estado**: aceptada
- **Fecha**: 2026-09-22

## Contexto

Las reglas pedían tests de integración de repositorios con Postgres real mediante **Testcontainers**, que necesita Docker. La máquina de desarrollo actual no tiene Docker, y PostgreSQL ya está instalado localmente.

## Decisión

- Los tests `*.int.test.ts` de `@norde/infra` corren contra un **Postgres real**. Se ejecutan con `pnpm --filter @norde/infra test:int`.
- La base se toma de `TEST_DATABASE_URL`. Si no está definida, se usa la `DATABASE_URL` de `apps/agent/.env` con el sufijo `_test`.
- `test/global-setup.ts`:
  - Crea la base si falta.
  - Borra el esquema `core` y aplica las migraciones desde cero en cada corrida.
  - Por seguridad, solo acepta nombres que terminan en `_test`.
- Cada test arranca con las tablas vacías.
- En CI corre en un job aparte con un servicio `postgres:18`.
- `test:int` no forma parte de `pnpm turbo test`, porque necesita una base.

## Consecuencias

- Se prueba contra el mismo motor y las mismas migraciones que en producción. Cualquier desarrollador con Postgres local puede correrlos.
- Los tests de un paquete corren de a un archivo por vez (comparten la base).
- Cuando haya Docker en todas las máquinas se puede pasar a Testcontainers cambiando solo `global-setup.ts`.
