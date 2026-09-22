# CLAUDE.md: apps/agent

Proceso de larga duración (Fastify). Tiene tres responsabilidades:

1. **Agente de IA** de WhatsApp y web chat.
2. **Webhooks entrantes**: Meta, MercadoLibre, portales.
3. **Jobs en segundo plano** (pg-boss): relay del outbox, handlers de eventos, cron de IPC, alertas y sincronización con portales.

Detalle funcional en [docs/modulos/01-agentes-ia.md](../../docs/modulos/01-agentes-ia.md). Base: el MVP `C:\APZ-WP-BOT`.

Se aplica además del `CLAUDE.md` de la raíz.

## Estructura

```
src/
├── main.ts                   # Arranque: env → logger → container → server; graceful shutdown
├── container.ts              # Composition root. Único que importa @norde/infra
├── config/
│   ├── env.ts                # Único lugar que lee process.env (Zod)
│   └── logger.ts             # pino con redacción de datos personales
├── http/
│   ├── server.ts             # buildServer(deps): Fastify sin efectos (testeable con inject)
│   ├── types.ts              # AppInstance
│   └── routes/               # Rutas HTTP (health, …)
├── channels/                 # (a crear) whatsapp/ y webchat/: webhook, firma, batcher, outbound
├── assistant/                # (a crear) agente de clientes: instrucciones, tools, respuesta por canal
├── webhooks/                 # (a crear) MercadoLibre, portales
└── jobs/                     # (a crear) workers pg-boss y cron → casos de uso
```

- **Ejecución**: corre el TypeScript fuente con `tsx`, tanto en desarrollo (`pnpm dev`) como en producción (`pnpm start`). No hay paso de build ni bundle: así cada paquete del workspace resuelve sus propias dependencias.
- `buildServer` no escucha ni lee el entorno: recibe sus dependencias. Los tests de rutas usan `app.inject()`.

## Reglas

- **Las tools del agente son adaptadores de presentación**, siempre en este orden:
  1. Validan los argumentos del LLM con Zod.
  2. Llaman **un** caso de uso con `actor = system:agent-ia`.
  3. Devuelven un resumen compacto.
  - PROHIBIDO que una tool acceda a la base o contenga reglas de negocio.
- Las tools **no envían mensajes**: marcan el contexto del turno, y el canal arma **un** mensaje de salida (patrón del MVP).
- **Prompts** en archivos propios (`assistant/instructions/*.ts`), en español rioplatense. Todo cambio de prompt se prueba con `scripts/simulate.ts` antes de commitear.
- **Handoff**: si la conversación está en `handed_off`, el agente **no responde**. Solo registra el mensaje y notifica. Lo decide el caso de uso de `conversations`, no el canal.
- **Webhooks**:
  - Firma verificada sobre el body crudo.
  - Responden 200 rápido y procesan en segundo plano.
  - Son idempotentes (ID de mensaje o evento).
- **Costo de WhatsApp**: mantener las reglas del MVP:
  - Un mensaje por turno.
  - Debounce.
  - No responder "ok" ni "gracias".
  - Límites por usuario y globales, y circuit breaker.
  - Nunca reintentar 4xx.
- **Jobs**:
  - Cada job llama un caso de uso.
  - Son idempotentes, con reintentos y backoff configurados en pg-boss.
  - Los cron se definen en `jobs/schedules.ts`, con horario en `America/Argentina/Buenos_Aires`.
- **Graceful shutdown**: drenar batcher y colas, cerrar pg-boss y el pool antes de salir.
- **Una sola instancia** mientras batcher y colas estén en memoria. Escalar requiere un ADR.

## Tests

- Firma, parser de entrada y rutas (Fastify `inject`).
- Tools: validación de argumentos y mapeo del caso de uso, con fakes del core.
- Armado de outbound por canal.
- Jobs: que cada worker llame el caso de uso correcto y sea idempotente.
