# ADR 0032: Consultas de MercadoLibre: lectura periódica y notificaciones sin firma como disparador

- **Estado**: aceptada
- **Fecha**: 2026-10-18
- **Reemplaza**: el punto "Sin webhooks de ML por ahora" del ADR 0022.
- **Complementa**: ADR 0029 (consultas de Zonaprop), ADR 0021 (jobs en `apps/gestion`) y la regla de `CLAUDE.md` sobre webhooks firmados.

## Contexto

La bandeja de consultas tiene que recibir los contactos que llegan por los avisos de MercadoLibre, como ya recibe los de Zonaprop. La API de inmuebles de ML los da de dos formas:

- **Lectura:** `GET /vis/users/{id}/leads/buyers?date_from=…`, paginado por interesado. Cada interesado trae su nombre, email y teléfono, y sus contactos (`leads`). Cada contacto tiene ID, tipo (`question`, `whatsapp`, `call`, `contact_request`, `visit_request`/`schedule`, `quotation`, `reservation`), fecha y aviso (`item_id`). El texto de una pregunta no viene: se lee de `/questions/{external_id}?api_version=4`. Los contactos de usuarios sin sesión (`guest`) no traen datos de contacto.
- **Notificaciones:** la app de ML avisa por `POST` a una URL fija, con el tópico `vis_leads` (un subtópico por tipo de contacto) o `questions`. **La notificación no viene firmada** y no se puede configurar un header propio, como en Zonaprop. ML espera un 200 en 500 ms. Si no lo recibe, reintenta durante una hora y puede desactivar los tópicos.

El ADR 0022 dejó las notificaciones de ML afuera hasta traer consultas, justamente por no tener firma.

## Decisión

- **Igual que Zonaprop (ADR 0029): la fuente de verdad es la lectura.**
  - Las dos cuentas de ML tienen el canal `mercadolibre` en el catálogo de portales. La de emprendimientos también, aunque todavía no publique: sus avisos de Tokko reciben consultas.
  - El job `portals.pull-leads` (cada 10 minutos) y `portals.leads_arrived` corren `PullPortalLeads` también para ellas, con los últimos 2 días. La bandeja no duplica por (canal, ID del contacto).
  - Un contacto entra con su propiedad si el aviso es una publicación de Norde (`item_id` = ID externo de la publicación). Si no, entra sin propiedad.
- **`MercadoLibreLeads`** (infra) implementa `PortalLeadSource`:
  - Aplana los contactos de cada interesado. Pide de a 50 interesados y sigue si ML devuelve menos.
  - Lee el texto de cada pregunta. Una pregunta borrada o moderada (`BANNED`) entra sin texto: el mensaje dice qué pidió la persona.
  - Traduce los tipos de contacto: pregunta → consulta, WhatsApp → WhatsApp, llamada → ver teléfono, pedido de contacto → que lo llamen, visita → visita. El resto, como "otro".
  - No pide los contactos anónimos.
  - `PortalLeadSourcesByProvider` elige la fuente por el proveedor del portal, como los conectores.
- **La notificación solo dispara una lectura.** `POST /api/webhooks/portals/mercadolibre`:
  - Es una **excepción a la regla de firma**, como la de Zonaprop, pero sin un secreto que validar. Se acepta solo si el `application_id` es el de la app de Norde (`MERCADOLIBRE_CLIENT_ID`). La notificación no se usa como dato.
  - `NotifyAccountLeads` busca la cuenta conectada cuyo ID en ML es el `user_id` y publica `portals.leads_arrived` para ese portal. Una cuenta que no es de Norde se ignora.
  - Tópicos `vis_leads` y `questions`. Los demás se aceptan con 200 y se ignoran, para que ML no los reintente ni desactive.
  - Rate limit por IP (240 por minuto), límite de 16 KB y validación con Zod de `topic`, `user_id` y `application_id`.
  - Sin `PORTALS_ENABLED` o sin `MERCADOLIBRE_CLIENT_ID`, responde 404.
- **Activar las notificaciones no es una acción del panel:** se configura en la app de ML (URL de notificaciones y tópico `vis_leads`). `EnablePortalLeadNotifications` sigue siendo solo para las cuentas que se conectan por código (Zonaprop).
- **No se loguean datos del interesado.**

## Consecuencias

- Las consultas de ML entran aunque no se configuren las notificaciones: tardan hasta 10 minutos. Con las notificaciones configuradas llegan en segundos.
- Quien conozca el ID de la app y el de una cuenta puede disparar lecturas, pero no puede meter consultas: se leen de la API con el token de la cuenta. El rate limit acota el abuso.
- Cada pregunta suma una llamada a `/questions` por lectura. Con el volumen de Norde (decenas por día, leídas cada 10 minutos sobre 2 días) está bien. Si crece, se puede guardar qué preguntas ya se leyeron.
- Mientras la etapa 3 no vincule los avisos de Tokko, sus consultas entran sin propiedad.
- En la app de ML hay que cambiar la URL de notificaciones a `/api/webhooks/portals/mercadolibre` (la de antes, `/api/portals/mercadolibre/webhook`, no existe) y suscribir `vis_leads`.
