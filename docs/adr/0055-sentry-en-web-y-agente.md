# ADR 0055: Sentry también en el sitio y en el agente

- **Estado**: aceptada
- **Fecha**: 2026-11-14
- **Complementa**: ADR 0049 (errores a Sentry en el panel), que dejaba `apps/web` y `apps/agent` para después. Issue #223.

## Contexto

El panel manda sus errores inesperados a Sentry desde el ADR 0049. El sitio y el agente siguen solo con el log de pino del VPS: un error del chat, de un webhook de WhatsApp o de una página del sitio no le avisa a nadie. La auditoría de #223 lo marcó como pendiente.

## Decisión

- **Agente** (`@sentry/node`): `src/config/sentry.ts` inicia el SDK al arrancar, antes de crear el servidor. La integración de Fastify del SDK manda los errores 5xx de cada ruta.
- **Sitio** (`@sentry/nextjs`), **solo el servidor**: `src/instrumentation.ts` inicia el SDK y reporta los errores de renders y route handlers con `onRequestError`. El navegador no carga el SDK: el sitio público cuida el peso del bundle y sus componentes cliente son chicos. Sin `withSentryConfig`: no se suben source maps.
- **Mismos filtros que el panel** (Ley 25.326): el SDK no junta usuario, cookies, headers, bodies ni query strings; el texto libre (mensajes, URLs, breadcrumbs) pasa por `scrubText`, que tapa emails, teléfonos, DNI y CUIT. En el agente, los mensajes de los contactos y las respuestas del modelo nunca van (`genAI` apagado).
- **Apagado por defecto**: cada app lee `SENTRY_DSN` y `SENTRY_ENVIRONMENT` de su `src/config/env.ts` (son del servidor, no `NEXT_PUBLIC_*`). Sin DSN (desarrollo, tests, CI) el SDK no se inicia. Cada app va en su propio proyecto de Sentry.

## Consecuencias

- Para activarlo hay que crear los proyectos en Sentry y cargar los DSN en el `.env` de cada app en el VPS.
- Los errores que se loguean como `Err` (esperados) no llegan a Sentry, igual que en el panel.
- Los errores de componentes cliente del sitio no se reportan. Si hiciera falta, se suma `instrumentation-client.ts` con el DSN en una `NEXT_PUBLIC_*` (como el panel).
- El filtrado está copiado en las tres apps (`scrubText`, `scrubEvent`, `scrubBreadcrumb`). Si cambia, se cambia en las tres.
