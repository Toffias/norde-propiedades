# Módulo 1: Agentes de IA

> Documento de detalle del módulo "Agentes de IA" de [diagrama-general.md](../diagrama-general.md).
> Base técnica: el MVP en `C:\APZ-WP-BOT`, que ya está probado y funcionando.

## 1. Objetivo

Atender a los clientes potenciales las 24 horas por dos canales:

- **WhatsApp**: el mismo enfoque que el MVP de APZ-WP-BOT.
- **Web Chat**: el mismo agente de IA, embebido en el sitio de Norde, sin la parte de WhatsApp.

En los dos canales, el agente sigue el flujo del diagrama:

1. **Captar datos del cliente**: nombre, qué busca, zona, presupuesto, etc.
2. **Ofrecer propiedades disponibles**, buscando en el stock real del Sistema de Gestión.
3. **Derivar al equipo interno** cuando hace falta una persona: visitas, negociación, reservas, consultas fuera de alcance.
4. **Catalogar al cliente**, con dos resultados posibles:
   - **Venta / Alquiler / Tasación**: el cliente queda como oportunidad para Norde.
   - **Aplica a otra inmobiliaria**: Norde no tiene hoy nada para ofrecerle. El agente lo registra igual, con la oportunidad en ese **estado**, para que el equipo interno revise si se le puede ofrecer algo de una **inmobiliaria socia**. Al cliente no se le menciona el estado: se le dice que un asesor va a revisar opciones y lo va a contactar.

**Fuente de datos:** toda la información de propiedades sale del **Sistema de Gestión** (módulo 3), donde el equipo carga las propiedades en venta, en alquiler y los emprendimientos. El agente no tiene stock propio.

---

## 2. Qué se reutiliza del MVP (APZ-WP-BOT)

El MVP ya es un bot inmobiliario para Argentina (CABA/GBA, español rioplatense), así que la mayor parte se copia casi tal cual.

### Stack

| Pieza         | Tecnología                                                                                                  |
| ------------- | ----------------------------------------------------------------------------------------------------------- |
| Runtime       | Node.js 22+, TypeScript (ESM, strict)                                                                       |
| Servidor HTTP | Fastify 5                                                                                                   |
| IA            | OpenAI Agents SDK (`@openai/agents`), modelo configurable (default `gpt-5-mini`)                            |
| Base de datos | PostgreSQL + Drizzle ORM                                                                                    |
| Validación    | Zod (env y parámetros de tools)                                                                             |
| Logs          | pino                                                                                                        |
| Tests         | Vitest                                                                                                      |
| Deploy        | VPS Linux + systemd + Nginx + certbot (sin Docker). En Norde se unifica con **PM2**, junto a las otras apps |

### Piezas que se copian sin cambios importantes

- **Agente e instrucciones** (`src/agent/`): el prompt tiene rol, tono rioplatense, relevamiento mínimo (operación, tipo y zona), formato de resultados (máximo 3 propiedades), reglas de derivación y límites de seguridad (defensa contra prompt injection, no dar asesoramiento legal ni financiero).
- **Tools del agente**:
  - `search_properties`: busca con filtros (operación, tipo, zona, precio, moneda, ambientes, amenities).
  - `get_property`: trae el detalle de una propiedad.
  - `show_photo`: muestra la foto de una propiedad.
  - `offer_buttons`: ofrece opciones cerradas con botones.
  - `create_lead`: registra el lead y dispara la derivación.
- **Las tools no envían mensajes**: marcan en un contexto del turno lo que quieren mostrar, y al final se arma **un solo mensaje** de respuesta. Esto es clave para controlar el costo en WhatsApp.
- **Memoria de la conversación**: el historial completo se guarda en JSONB, se recorta a N ítems y se reinicia después de 24 h de inactividad.
- **Integración con WhatsApp** (Meta Cloud API directa, sin SDK):
  - Verificación del webhook y firma HMAC calculada sobre el body crudo.
  - Idempotencia y descarte de mensajes viejos.
  - Agrupación de mensajes seguidos en un solo turno (debounce) y cola secuencial por usuario.
  - Límites por usuario y globales, y un circuit breaker si el agente falla varias veces seguidas.
- **Lecciones aprendidas que hay que respetar**:
  - `maxTokens` incluye los tokens de razonamiento: usar alrededor de 3000 con `reasoning.effort: 'low'`.
  - Nunca reintentar un envío que falló con 4xx (se cobraría doble).
  - Usar un token de System User que no expire.
  - La app de Meta tiene que estar en modo **Live**, suscripta solo al campo `messages`.

---

## 3. Arquitectura propuesta: un núcleo y dos canales

La idea es **separar el agente del canal**. El núcleo (agente, tools, memoria, leads) es el mismo, y cada canal es un adaptador de entrada y salida.

```
                  ┌──────────────────────────────┐
  WhatsApp  ───►  │  Adaptador WhatsApp          │──┐
  (Meta Cloud)    │  webhook, firma, debounce,   │  │
                  │  cola, límites, envío        │  │
                  └──────────────────────────────┘  │     ┌─────────────────────────┐
                                                    ├──►  │  NÚCLEO DEL AGENTE      │
                  ┌──────────────────────────────┐  │     │  agente + instrucciones │
  Web Chat  ───►  │  Adaptador Web Chat          │──┘     │  tools                  │
  (widget en      │  API HTTP/SSE, sesión        │        │  memoria (conversación) │
  el sitio)       │  anónima, rate limit por IP  │        │  leads / catalogación   │
                  └──────────────────────────────┘        └───────────┬─────────────┘
                                                                      │
                                                                      ▼
                                                        ┌──────────────────────────┐
                                                        │  SISTEMA DE GESTIÓN      │
                                                        │  (módulo 3)              │
                                                        │  propiedades, clientes,  │
                                                        │  agentes, notificaciones │
                                                        └──────────────────────────┘
```

### 3.1 Núcleo compartido

- `ConversationRunner`, agente, instrucciones y tools, igual que en el MVP.
- **Instrucciones por canal**: una base común y un bloque específico de cada canal.
  - WhatsApp: formato `*negrita*`, sin markdown y un solo mensaje por turno.
  - Web: se puede usar markdown liviano y mostrar tarjetas de propiedad.
- **Salida por canal**: `buildOutbound` pasa a ser una función por canal.
  - WhatsApp: se mantiene la lógica actual (foto > botones > texto).
  - Web: devuelve una respuesta estructurada (texto, tarjetas de propiedades, botones), que el widget dibuja.

### 3.2 Adaptador WhatsApp

Es el del MVP sin cambios: webhook, firma, parser de entrada, batcher, cola por usuario, límites, breaker y cliente de envío.

### 3.3 Adaptador Web Chat

La diferencia con WhatsApp es que **no hay costo por mensaje**. Solo se paga el uso del LLM, así que se pueden relajar algunas restricciones: mostrar más de una foto, varias tarjetas por respuesta, etc.

| Tema               | Propuesta                                                                                                                              |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Transporte         | `POST /chat/messages` con respuesta en streaming (SSE), para ver el texto a medida que se genera                                       |
| Identidad          | ID de sesión anónimo en cookie o `localStorage`. Cuando el cliente deja teléfono o email, la conversación se vincula a ese cliente     |
| Widget             | Componente React en el sitio Next.js (módulo 2): burbuja flotante y, opcionalmente, un botón "Consultar" en la ficha de cada propiedad |
| Contexto de página | Si el chat se abre desde la ficha de una propiedad, se pasa su `propertyId` al agente                                                  |
| Anti-abuso         | Rate limit por IP y por sesión, largo máximo de mensaje, y Cloudflare Turnstile si aparece spam                                        |
| Debounce           | No hace falta: en web el usuario envía mensajes completos                                                                              |
| Pasar a WhatsApp   | Al derivar, ofrecer "seguir por WhatsApp" con un link `wa.me` y un texto que incluya un código de conversación                         |

---

## 4. Cambios necesarios respecto del MVP

El MVP resolvió lo principal, pero dejó algunos huecos que para Norde sí hacen falta.

### 4.1 Modelo de datos

Las tablas del MVP se reparten entre los módulos de `@norde/core` (ver [arquitectura.md](../arquitectura.md)).

- **Módulo `conversations`** (reemplaza `conversations` y `messages` del MVP):
  - Se agrega `channel` (`whatsapp` | `web`).
  - El `phone` único se reemplaza por `(channel, external_id)`, donde `external_id` es el teléfono o el ID de sesión web.
  - Se agrega `client_id`, que se completa cuando se identifica al cliente.
  - El estado (`active`, `handed_off`, `closed`) se modela como máquina de estados en el dominio.
- **Módulo `clients`** (reemplaza `leads` del MVP): cliente, canales de contacto y **oportunidades**, con la catalogación del diagrama (venta, alquiler, tasación, aplica a otra inmobiliaria), búsqueda, canal de origen y agente asignado. Detalle en el módulo 3, sección 3.
- `processed_messages` (idempotencia) queda como detalle de infraestructura del canal WhatsApp.

### 4.2 Tools nuevas o modificadas

| Tool                           | Cambio                                                                                                                                              |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_properties`            | Busca en el **Sistema de Gestión**, solo propiedades publicadas y disponibles. Reemplaza al `mock.provider.ts` y al stub `http.provider.ts` del MVP |
| `create_lead`                  | Se amplía con los campos de catalogación y se renombra a algo como `register_client`. Crea o actualiza el cliente en el Sistema de Gestión          |
| `request_appraisal` (nueva)    | Para propietarios que quieren tasar: dirección, tipo, superficie aproximada y datos de contacto. Crea una tasación en el módulo Tasaciones          |
| `list_owner_intent` (opcional) | Para propietarios que quieren vender o alquilar con Norde. Se puede cubrir con `register_client`                                                    |

### 4.3 Toma de control humana (handoff)

Es lo más importante que falta. En el MVP, el estado `handed_off` se guarda pero nunca se lee, así que el bot sigue respondiendo después de derivar.

Qué hay que construir:

1. **Mientras la conversación está en `handed_off`, el bot no responde.** Solo registra los mensajes y avisa al agente asignado.
2. **Bandeja de conversaciones en el Sistema de Gestión**: ver el historial completo, **responder desde el panel** (por la API de WhatsApp o por el web chat) y **devolver la conversación al bot**.
3. **Pausa automática**: si un asesor contesta desde el panel, el bot queda pausado N horas.
4. **Notificación al equipo**: se reemplaza el webhook genérico del MVP por la creación del cliente en el Sistema de Gestión y un aviso al asesor asignado (email, WhatsApp interno o notificación en el panel).

### 4.4 Integración con el Sistema de Gestión

**No hay API HTTP entre el agente y la gestión.** Son dos procesos separados (`apps/agent` y `apps/gestion`) que usan los **mismos casos de uso** de `@norde/core`, contra la misma base.

| Necesidad                          | Caso de uso (módulo)                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| Buscar propiedades                 | `SearchProperties`, `GetPropertyDetail` (`properties`)                          |
| Registrar cliente y oportunidad    | `RegisterContact` (`clients`): deduplica por teléfono o email y agrega el canal |
| Pedir tasación                     | `RequestAppraisal` (`appraisals`)                                               |
| Derivar a humano o devolver al bot | `HandOffConversation`, `ReturnConversationToBot` (`conversations`)              |
| Asignar agente y notificar         | Handler del evento `OpportunityCreated` (`clients`), en un job                  |

- Las tools del agente llaman a estos casos de uso con `actor = system:agent-ia`, que tiene permisos acotados.
- La bandeja de conversaciones del panel usa las queries del módulo `conversations`.
- Para responder desde el panel por WhatsApp, `apps/gestion` llama a un caso de uso que encola el envío. El envío real lo hace `apps/agent`, que es el único proceso que habla con Meta.

### 4.5 WhatsApp: temas pendientes

- **Plantillas (templates)**: hacen falta para escribirle al cliente pasadas las 24 h. Por ejemplo, para un seguimiento, un aviso de propiedad nueva que coincide con su búsqueda o una respuesta del asesor fuera de la ventana. Se aprueban en Meta y tienen otro costo.
- **Audios**: hoy se responde "solo texto". Se puede transcribir con la API de OpenAI (Whisper o `gpt-4o-transcribe`) y tratar el audio como texto. En Argentina hay muchos audios.
- **Ubicación**: aceptar un pin de ubicación como zona de búsqueda.
- **`criteria` guardado**: hoy se guarda pero no se usa. Se puede inyectar en el prompt para retomar la búsqueda anterior.

### 4.6 Escalabilidad

La cola, el batcher y los contadores de avisos viven en memoria, así que el bot funciona en **una sola instancia**. Para el volumen de una inmobiliaria alcanza. Si en algún momento hace falta más de una instancia, pasarlos a Redis o a locks en PostgreSQL.

---

## 5. Control de costos

**WhatsApp** (desde el 1/10/2026 Meta cobra por mensaje de servicio entregado; en Argentina, aproximadamente 0,026 USD):

- Un solo mensaje por turno, con agrupación de mensajes seguidos.
- No responder a "ok", "gracias", "👍".
- Límites por usuario (30 por hora, 120 por día) y un tope global diario.
- Estimación del MVP: alrededor de 0,17 USD por conversación de 6 respuestas.

**OpenAI:**

- Modelo chico con razonamiento bajo.
- Historial recortado y tools que devuelven resúmenes compactos.
- Registrar el uso de tokens por turno (ya lo hace el MVP) para reportes de costo.

**Web chat**: solo el costo del LLM, más el rate limit por IP para evitar abuso.

---

## 6. Plan de trabajo sugerido

| Fase                           | Alcance                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| **F1: Base** ✅                | Copiar APZ-WP-BOT al nuevo repo. Separar núcleo y canal. Agregar `channel` al modelo. Probar con `scripts/simulate.ts` |
| **F2: Conexión al core** ✅    | Tools que llaman a `SearchProperties` y `RegisterContact` de `@norde/core`, en lugar del provider mock                 |
| **F3: WhatsApp en producción** | Número de Norde, app de Meta en Live, token de System User, deploy en el VPS                                           |
| **F4: Handoff**                | Estado respetado por el bot, bandeja en el panel, responder desde el panel, devolver al bot                            |
| **F5: Web Chat**               | Endpoint con SSE, widget React en el sitio, sesión anónima, contexto de propiedad                                      |
| **F6: Mejoras**                | Tasaciones por chat, audios, templates de seguimiento, alertas de propiedades nuevas                                   |

---

## 7. Preguntas abiertas

1. **"Aplica a otra inmobiliaria"**: ✅ Definido. Es un estado de la oportunidad para que el equipo revise opciones con inmobiliarias socias (ver sección 1).
2. **Asignación de agente**: ¿round-robin, por zona, por tipo de operación o manual desde el panel?
3. **Canal de aviso al asesor**: ¿email, WhatsApp personal del asesor, notificación en el panel o varias?
4. **Horario**: ¿el bot responde siempre, o fuera de horario promete contacto al día hábil siguiente?
5. **Web chat anónimo**: ¿se pide teléfono o email antes de empezar, o recién al derivar? Recomendación: al derivar, para no cortar la conversación.
6. **Número de WhatsApp**: ¿se usa un número nuevo o el actual de Norde? El número no puede seguir usándose en la app de WhatsApp.

---

## 8. Estado de la implementación

### 8.1 Hecho (F1 y F2)

El agente de WhatsApp hace lo mismo que el MVP, sobre la arquitectura del proyecto:

- **Core**:
  - `properties`: `SearchProperties` y `GetPropertyDetail`. Solo ofrecen propiedades disponibles y publicadas en la web.
  - `clients`: `RegisterContact`, que deduplica por teléfono o email y abre la oportunidad o suma el pedido a la que está abierta. Incluye el estado "Aplica a otra inmobiliaria" y `NotifyTeamOfOpportunity`.
  - `conversations`: `ReceiveInboundMessages`, que registra los mensajes de forma idempotente y decide el plan de respuesta, y `SendReply`.
- **`@norde/agent-kit`**: el runner del MVP sobre el OpenAI Agents SDK (ADR 0009).
- **`apps/agent`**:
  - Instrucciones del MVP adaptadas a Norde, con un bloque por canal.
  - Las tools `search_properties`, `get_property`, `show_photo`, `offer_buttons` y `register_client`.
  - Canal WhatsApp completo: firma, debounce, cola por contacto, límites, breaker y un mensaje por turno.
- **Jobs**: outbox → pg-boss → aviso al equipo por webhook (Slack, Teams, n8n) o, sin webhook configurado, al log.
- **Herramientas**:
  - `pnpm db:seed` carga las 28 propiedades de prueba del MVP.
  - `pnpm --filter @norde/agent simulate` permite chatear por consola con el agente real, sin WhatsApp.

### 8.2 Decisiones tomadas al implementar

- **Handoff**: el bot no responde si la conversación está `handed_off`. Lo decide el core, que devuelve el plan `silent`.
  - Hoy nada la pone en ese estado: registrar al cliente **no** silencia al bot, así el cliente sigue atendido hasta que exista la bandeja (F4).
  - Tras 24 h de inactividad, la conversación arranca de cero y vuelve al bot.
- **Deduplicación por teléfono**: el mismo celular con o sin el 9 de móvil (`+54 9 11…` en WhatsApp, `11…` en un formulario) es el mismo cliente (`Phone.matchKey`). La base lo garantiza con índices únicos.
- **Tasaciones**: por ahora se registran como oportunidad de tipo `appraisal`. Cuando exista el módulo `appraisals`, una tool `request_appraisal` va a crear la tasación.
- **Topes de uso**: ventanas móviles (última hora y últimas 24 h) en lugar del día calendario UTC del MVP.
- **Auditoría**: se auditan los cambios de estado (conversación iniciada o vinculada a un cliente, cliente registrado, oportunidad abierta o actualizada). Cada mensaje no se audita: el registro de mensajes ya es su traza.
- **Memoria del agente**: se guarda en la conversación y es opaca para el core. Si el turno falla, no se guarda.

### 8.3 Pendiente

| Tema                           | Detalle                                                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| **F3: WhatsApp en producción** | Número de Norde, app de Meta en modo Live, token de System User, webhook en `https://<dominio>/webhooks/whatsapp`, deploy |
| **F4: Handoff**                | Bandeja en `apps/gestion`, `HandOffConversation` y `ReturnConversationToBot`, responder desde el panel                    |
| **F5: Web Chat**               | Endpoint con SSE y widget. El agente ya tiene el bloque de instrucciones del canal `web_chat`                             |
| Asignación de asesor           | Pregunta abierta 2 (sección 7). Hoy la oportunidad nace sin asesor y el aviso va al canal del equipo                      |
| Alta de propiedades            | El stock sale del seed de desarrollo hasta que el panel tenga el ABM de propiedades                                       |
