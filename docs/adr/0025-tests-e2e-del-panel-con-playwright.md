# ADR 0025: Tests e2e del panel con Playwright y una base propia

- **Estado**: aceptada
- **Fecha**: 2026-10-11
- **Complementa**: ADR 0010 (tests de integración contra Postgres local).

## Contexto

Los casos de uso tienen tests unitarios con fakes y los repositorios tienen tests de integración contra Postgres (ADR 0010). Lo que no se prueba es el panel armado: sesión, permisos, Server Actions, pantallas y jobs funcionando juntos. Hoy esas regresiones se encuentran revisando a mano en el navegador.

## Decisión

- Los tests e2e de `apps/gestion` usan **Playwright** y viven en `apps/gestion/e2e/` (`*.spec.ts`). Se corren con `pnpm --filter @norde/gestion test:e2e`.
- Corren contra una **base propia**, cuyo nombre tiene que terminar en `_e2e`:
  - `E2E_DATABASE_URL`, si está definida.
  - Si no, la base de `apps/gestion/.env` con el sufijo `_e2e`: mismas credenciales, otra base.
  - Sin `.env` (CI), `norde_e2e` con el rol `norde`.
- **Antes de cada corrida, `scripts/db/e2e-reset.ts` recrea la base**: borra los esquemas `core` y `pgboss`, aplica las migraciones y carga el seed de desarrollo (propiedades, un usuario por rol, consultas). Cada corrida arranca del mismo estado.
- **Playwright levanta el panel en el puerto 3011**, con un entorno explícito:
  - Secreto de sesión de prueba y storage en disco.
  - Jobs prendidos y las funciones que Norde no usa apagadas.
  - Sin credenciales de servicios externos (mail, portales, webhooks, S3) y un geocodificador que no responde.
  - En local usa `next dev`; en CI, el build de producción (`next start`).
- **Se ingresa una vez por rol** (`auth.setup.ts`) y los specs reusan esa sesión (`storageState`). En producción Better Auth limita los ingresos a 5 por minuto.
- Los specs no dependen del orden ni de datos que cree otro spec: usan el seed o crean lo suyo con nombres únicos.
- **En CI corre en un job aparte** (`e2e`), con un servicio `postgres:17` (ADR 0041). Por ahora no bloquea el deploy a UAT.

## Consecuencias

- Se prueban los flujos tal como los usa el equipo, con las mismas migraciones que producción y sin tocar la base de desarrollo.
- `test:e2e` no forma parte de `pnpm turbo test` ni de `pnpm check`, porque necesita una base y un navegador.
- El seed de desarrollo pasa a ser también el de los e2e: cambiarlo puede romper specs.
- La lectura del entorno de los e2e vive en `@norde/scripts` (`e2e-database.ts`), porque la regla de `apps/*` reserva `process.env` a `src/config/env.ts`.
- Cuando los e2e estén estables, se suman a los `needs` del deploy a UAT.
