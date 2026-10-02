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
│   ├── signature.ts          # Firma HMAC `sha256=` sobre el body crudo (Meta y webhooks propios)
│   └── routes/               # Rutas HTTP (health, …)
├── assistant/                # Agente de clientes (igual en todos los canales)
│   ├── customer-assistant.ts # Arma el AgentRunner de @norde/agent-kit con instrucciones y tools
│   ├── turn-context.ts       # Estado del turno que completan las tools
│   ├── property-presenter.ts # Vista compacta de propiedades para el modelo (precios, links)
│   ├── instructions/         # Prompt: base común + bloque por canal
│   └── tools/                # search_properties, get_property, show_photo, offer_buttons, register_client
├── channels/
│   └── whatsapp/             # Webhook (firma, parser), batcher, cola por contacto, breaker,
│                             # avisos, armado de la respuesta y WhatsAppTurnHandler
├── webhooks/                 # Consultas del formulario web (firma + rate limit); MercadoLibre y portales, a crear
└── jobs/
    └── event-subscriptions.ts # Evento de dominio → caso de uso (ej. avisar al equipo)
scripts/
└── simulate.ts               # Chat por consola contra el agente real (sin WhatsApp)
```

- **Flujo de un mensaje de WhatsApp**: webhook (firma) → batcher (debounce) → cola del contacto → `WhatsAppTurnHandler`:
  1. `ReceiveInboundMessages` registra los mensajes (idempotente) y devuelve el **plan**: ignorar, silencio, aviso o agente.
  2. Si el plan es `agent`: corre el agente, y las tools llaman a `SearchProperties`, `GetPropertyDetail` y `RegisterContact`.
  3. `SendReply` envía **un** mensaje y guarda la memoria del agente.
- **Eventos**: los casos de uso escriben en el outbox; el relay los pasa a pg-boss y `jobs/event-subscriptions.ts` los conecta con casos de uso (hoy: `NotifyTeamOfOpportunity`). El outbox, el relay y pg-boss viven en `@norde/infra` y se arman en `container.ts`.
- Sin las variables `WHATSAPP_*` y `OPENAI_API_KEY`, el proceso arranca igual (health y jobs) con el canal deshabilitado.

- **Ejecución**: corre el TypeScript fuente con `tsx`, tanto en desarrollo (`pnpm dev`) como en producción (`pnpm start`). No hay paso de build ni bundle: así cada paquete del workspace resuelve sus propias dependencias.
- `buildServer` no escucha ni lee el entorno: recibe sus dependencias. Los tests de rutas usan `app.inject()`.

## Reglas

- **Las tools del agente son adaptadores de presentación**, siempre en este orden:
  1. Validan los argumentos del LLM con Zod.
  2. Llaman **un** caso de uso con `actor = system:agent-ia`.
  3. Devuelven un resumen compacto.
  - PROHIBIDO que una tool acceda a la base o contenga reglas de negocio.
- Las tools **no envían mensajes**: marcan el contexto del turno, y el canal arma **un** mensaje de salida (patrón del MVP).
- **Prompts** en archivos propios (`assistant/instructions/*.ts`), en español rioplatense. Todo cambio de prompt se prueba con `pnpm --filter @norde/agent simulate` antes de commitear.
- Los parámetros de las tools usan `.nullable()`, no `.optional()`: el modo estricto de OpenAI exige todos los campos.
- Los textos fijos del canal (avisos, respuesta de error) viven en el canal (`channels/whatsapp/notices.ts`, `reply-builder.ts`); **cuándo** se mandan lo decide el core (`ReplyPlan`).
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
- Turnos completos con `ScriptedModel` (`@norde/agent-kit/testing`) y los fakes en memoria del core: sin OpenAI ni base (ver `whatsapp-turn-handler.test.ts`).
- Tools: validación de argumentos y mapeo del caso de uso, con fakes del core.
- Armado de outbound por canal.
- Jobs: que cada worker llame el caso de uso correcto y sea idempotente.
