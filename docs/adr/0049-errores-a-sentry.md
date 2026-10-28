# ADR 0049: Errores inesperados del panel a Sentry

- **Estado**: aceptada
- **Fecha**: 2026-10-27
- **Complementa**: ADR 0021 (procesos en segundo plano en `gestion`).

## Contexto

Los errores inesperados del panel solo quedaban en el log de pino del VPS: nadie se entera hasta que Norde avisa, y buscar un `digest` exige entrar por SSH. Los tests (unit, integración y e2e) no cubren lo que solo pasa en producción: integraciones de terceros, datos reales y jobs que corren solos. Hace falta un aviso con el stack trace, agrupado y con el release, sin costo para el tamaño de Norde. Sentry tiene plan gratis, SDK oficial para Next.js y región en la UE.

El navegador también tiene errores (componentes cliente) y para reportarlos necesita el DSN en el bundle. Next solo lo incrusta si el código lee `process.env.NEXT_PUBLIC_*` con el nombre literal, y la regla del repo es que solo `src/config/env.ts` lee `process.env`; ese archivo es `server-only` porque valida secretos.

## Decisión

- **Sentry en `gestion`** (`@sentry/nextjs`, proyecto `norde-propiedades`, región UE). `apps/web` y `apps/agent` quedan para después.
- **Servidor**: `instrumentation.ts` inicia Sentry en `register()` antes de los jobs, y `onRequestError` suma `captureRequestError` al log de siempre. No hay configuración Edge: el proxy corre en Node.
- **Navegador**: `instrumentation-client.ts` inicia Sentry. `error.tsx` y `global-error.tsx` reportan solo los errores sin `digest`; los que traen `digest` vienen del servidor y ya se reportaron.
- **Segundo archivo de entorno**: `src/config/public-env.ts` lee y valida con Zod **solo** las `NEXT_PUBLIC_*` (`NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT`). La excepción está en `packages/config/eslint`. Nada secreto va ahí: se incrusta en el bundle y cambiarlo obliga a volver a compilar.
- **Datos personales (Ley 25.326)**: con `dataCollection` el SDK no junta usuario, cookies, headers, bodies, query strings, parámetros de queries, argumentos de jobs, entradas o salidas de IA ni variables locales. `beforeSend` y `beforeBreadcrumb` pasan el texto libre (mensajes, URLs, breadcrumbs) por `scrubText`: sin query string, emails y números de 7 dígitos o más enmascarados. Sin replay de sesión.
- **Cuota**: 10 % de las requests con traza.
- **Apagado sin DSN**: en desarrollo, tests, CI y e2e no se reporta nada.
- **Source maps**: el build los sube con `SENTRY_AUTH_TOKEN` (secret del entorno `uat` en GitHub, o `.env.sentry-build-plugin` local, ignorado por git). Sin token, el build sigue igual.

## Consecuencias

- Los errores llegan a Sentry además del log; el log sigue siendo la fuente completa.
- Un error de un job que se loguea como `Err` no llega a Sentry: solo las excepciones. El monitoreo de los cron (check-ins) queda para cuando existan en `jobs/schedules.ts`.
- `deploy-uat.yml` necesita la variable `SENTRY_DSN_GESTION` y el secret `SENTRY_AUTH_TOKEN` (docs/deploy.md).
- El filtro puede enmascarar de más (un monto largo en un mensaje): es preferible a que salga un teléfono.
