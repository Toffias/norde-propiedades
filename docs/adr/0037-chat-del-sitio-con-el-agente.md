# ADR 0037: Chat del sitio con el agente de IA

- **Estado**: aceptada
- **Fecha**: 2026-10-18
- **Complementa**: ADR 0021 (jobs y webhooks en gestión) y el módulo 1 (`docs/modulos/01-agentes-ia.md`, F5).

## Contexto

El sitio público necesita el mismo agente de IA que atiende WhatsApp, embebido como una burbuja de chat. El módulo 1 proponía que el navegador llamara a `POST /chat/messages` del agente, con la respuesta en streaming (SSE).

El core ya conocía el canal `web_chat` (conversaciones, contactos y el bloque de instrucciones del agente), pero faltaban el transporte, la sesión y el widget. Además:

- `apps/agent` no tiene CORS ni rate limit por IP, y solo lo publica Nginx para los webhooks de Meta.
- `@norde/agent-kit` corre cada turno sin streaming.

## Decisión

- **El navegador habla con `apps/web`, nunca con el agente.**
  - El widget llama a una Server Action (`sendChatMessage`).
  - La Server Action le manda el mensaje a `apps/agent` por `POST /chat/messages`, con el body firmado (`x-norde-signature: sha256=` + HMAC), igual que las consultas del formulario (ADR 0021).
  - Así no hace falta CORS, el agente sigue sin endpoints públicos sin firma, y el rate limit por IP queda en la web, que ve el IP real.
  - Secreto compartido: `AGENT_CHAT_SECRET` (web) = `WEB_CHAT_SECRET` (agente). Sin las variables, la web no muestra la burbuja y el agente no expone la ruta.
- **Sesión anónima en una cookie `httpOnly`** (`norde_chat`, 30 días), que crea la Server Action.
  - La sesión es el `externalId` de la conversación (`web_chat`, sesión).
  - El ID de cada mensaje lo genera el navegador: un reintento no se responde dos veces.
- **El historial que ve el visitante lo guarda su navegador** (`localStorage`, últimos 50 mensajes).
  - La memoria del agente sigue en la conversación, como en WhatsApp.
  - "Conversación nueva" borra la cookie y el historial local.
- **La respuesta vuelve entera en la misma petición**, sin streaming:
  - `WebChatTurnHandler` sigue el mismo plan del core que WhatsApp (`ReceiveInboundMessages` → agente → `SendReply`).
  - Devuelve el texto con markdown liviano, la foto de `show_photo` y los botones de `offer_buttons`, todo junto: en la web no hay costo por mensaje.
  - `WebChatMessenger` (infra) es el `ChannelMessenger` del canal: "enviar" es solo registrar, porque la respuesta viaja en la respuesta HTTP.
- **Límites**:
  - 20 mensajes por IP cada 10 minutos en la web.
  - Los límites por contacto del core, por sesión (`LIMIT_CONTACT_MESSAGES_*`), responden 429 y el widget pide esperar.
  - Un tope diario de respuestas del canal (`LIMIT_WEB_CHAT_REPLIES_PER_DAY`, 2000 por defecto) acota el gasto del LLM. Al llegar al tope, el agente responde 503.
- **El agente y el breaker son los mismos para todos los canales.** Si OpenAI falla en cadena, el chat responde "no disponible" en lugar de un mensaje de error por turno.
- **El widget dibuja el markdown sin inyectar HTML**: un parser propio arma elementos de React.
  - Solo enlaza URLs http(s).
  - Los links al propio sitio navegan sin recargar. En mobile, además, cierran el chat.

## Consecuencias

- El visitante espera la respuesta completa (unos segundos, con indicador de "escribiendo"). Para mostrar el texto a medida que se genera, hace falta streaming en `@norde/agent-kit` y en la Server Action. Queda para una etapa siguiente.
- La cola por sesión vive en memoria: vale la regla de una sola instancia del agente.
- Las conversaciones del chat quedan en `core.conversations` con canal `web_chat`, listas para la bandeja de F4.
- Pendiente: el contexto de la ficha (`propertyId`) al abrir el chat desde una propiedad, y "seguir por WhatsApp" al derivar.
