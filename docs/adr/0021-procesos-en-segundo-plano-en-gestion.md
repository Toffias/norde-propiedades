# ADR 0021: Los procesos en segundo plano corren en apps/gestion

- **Estado**: aceptada
- **Fecha**: 2026-10-05
- **Reemplaza**: la parte de "jobs y relay en `apps/agent`" del ADR 0006 y del ADR 0020.

## Contexto

El ADR 0006 puso el relay del outbox y los workers de pg-boss en `apps/agent`, porque era "el único proceso que siempre está prendido". El ADR 0020 sumó ahí las variantes de fotos y los PDF de la ficha. Con el tiempo, `apps/agent` terminó corriendo todos los procesos del sistema: importaciones, reglas y acciones masivas de oportunidades, ruteo de consultas, supresión y unificación de contactos.

Eso ya no se sostiene. El deploy es un VPS con PM2 (§10 de la arquitectura), así que `apps/gestion` también es un servidor Node de larga duración. Y genera dependencias raras:

- Con el agente apagado, las fotos quedan en "Procesando" para siempre, no salen los PDF y no se aplican las reglas, las importaciones ni la supresión de datos.
- En desarrollo hay que levantar el agente, con su `.env` de OpenAI y WhatsApp, para probar funciones del panel que no tienen nada que ver con la IA.
- El agente carga permisos de sistema que no le corresponden (`properties:process-media`, `opportunities:run-bulk`, `*:erase-client-data`…).

## Decisión

- **El relay del outbox y los workers de pg-boss corren en `apps/gestion`.** `apps/agent` se queda solo con la conversación de IA: el webhook de WhatsApp, su batcher y cola en memoria, el runner del agente y, cuando exista, el web chat.
- **Arranque una vez por proceso**, desde `instrumentation.ts` (`register()`):
  - Solo en el runtime de Node y nunca en `next build`.
  - Un guard en `globalThis` evita un segundo arranque cuando Next vuelve a evaluar los módulos en desarrollo.
  - SIGTERM y SIGINT cortan el relay, esperan los jobs en curso (pg-boss, hasta 10 s) y cierran el pool.
- **Excepción a "solo `env.ts` lee `process.env`"**: `instrumentation.ts` compara `process.env.NEXT_RUNTIME === 'nodejs'` literalmente. Next compila ese archivo también para Edge, y ese chequeo literal es lo único que deja el código de Node fuera del bundle Edge. Es una constante del build, no configuración, y la línea lleva su `eslint-disable` con el motivo.
- **Composition root de los jobs en `src/container.ts`**, el único archivo de la app que importa `@norde/infra`:
  - `startJobs()` arma el bus, el relay y las suscripciones con su propio pool (`norde-gestion-jobs`). Un pedido HTTP nunca lo levanta.
  - Las suscripciones viven en `apps/gestion/src/jobs/event-subscriptions.ts`. Cada una llama **un** caso de uso.
  - Los nombres de las colas (`<evento>.<suscripción>`) **no cambian**, para que los jobs que ya estaban encolados se sigan procesando.
- **Los actores de sistema de los jobs** viven en el container de `apps/gestion`: `system:scheduler` (y su variante de conversión), `system:import` y `system:auth`, este último para rearmar el actor de quien pidió una acción masiva. El agente solo tiene `system:agent-ia`.
- **`JOBS_ENABLED`** (por defecto `true`) pasa a `apps/gestion`. Con `false`, el proceso no arranca nada y los eventos esperan en el outbox.
- **Una sola instancia de `gestion`**, en modo fork. El relay (`FOR UPDATE SKIP LOCKED`) y pg-boss toleran varias, pero si algún día se escala, solo una lleva `JOBS_ENABLED=true`.
- **El webhook de consultas del formulario web** (`POST /api/webhooks/inquiries/web`) pasa a ser un route handler de `apps/gestion`:
  - No es del agente: guarda una consulta en la bandeja del panel.
  - Mismo contrato: firma `x-norde-signature` (HMAC-SHA256 del body crudo), cuerpo de hasta 16 KB, validación con Zod y las mismas respuestas.
  - El rate limit por IP vive en memoria del proceso: alcanza con una instancia.
  - El proxy de sesión no intercepta `/api/webhooks/*`: se autentican con su firma.
- **Si el agente un día necesita reaccionar a un evento** (por ejemplo, mandar un WhatsApp), se suscribe a la cola de pg-boss que alimenta el relay de `gestion`. No corre un segundo relay.

## Consecuencias

- Con solo `apps/gestion` levantado, en desarrollo y en producción, las fotos generan sus variantes, salen los PDF y corren las importaciones, las reglas y la supresión. El agente puede estar apagado.
- `apps/gestion` suma pg-boss al proceso del panel. Un job pesado (sharp, pdf-lib) comparte la CPU con las pantallas. Si eso llegara a notarse, se separa un worker con su propio ADR.
- Un deploy de `gestion` corta los jobs en curso. pg-boss los reintenta y cada handler es idempotente.
- Los jobs que todavía no existen y la arquitectura asignaba al agente también van a `apps/gestion`: IPC diario, alertas, sincronización con portales y revalidación de la web.
- PM2 sigue con tres procesos (`ecosystem.config.cjs`).
- `apps/web` firma cada consulta con `INQUIRY_WEBHOOK_SECRET` y la manda a `https://gestion.norde.com.ar/api/webhooks/inquiries/web`.
