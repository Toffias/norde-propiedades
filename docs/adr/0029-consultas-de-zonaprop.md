# ADR 0029: Consultas de Zonaprop: lectura periódica y avisos sin firma como disparador

- **Estado**: aceptada
- **Fecha**: 2026-10-16
- **Complementa**: ADR 0021 (los jobs corren en `apps/gestion`), ADR 0026 (Zonaprop como integrador) y la regla de `CLAUDE.md` sobre webhooks firmados.

## Contexto

La etapa 4 de Zonaprop (#14) trae a la bandeja de consultas los contactos que llegan por los avisos. Open Navent los da de dos formas:

- **Lectura:** `GET /v2/inmobiliarias/{codigo}/mensajes?fromDate=yyyyMMdd`, paginado. Cada contacto trae su ID (`idMensaje`), el tipo de contacto (`idContactoAccion`: consulta, que me llamen, visita, tasación, ver teléfono, ver WhatsApp), nombre, email, teléfono, texto, fecha y el código del aviso.
- **Avisos (callbacks):** `PUT /v1/configuracion/callbacks` configura una URL y un header de autorización fijo que elige el integrador. `PUT /v1/configuracion/callbacks/{evento}` suscribe `CONTACTO` y `CONTACTO_MENSAJE`. **El aviso no viene firmado.** Zonaprop espera la respuesta 1,5 segundos y reintenta durante 72 horas ante un 4xx o 5xx.

`CLAUDE.md` pide verificar la firma de los webhooks sobre el body crudo. Un aviso de Zonaprop no se puede verificar así.

## Decisión

- **La fuente de verdad es la lectura**, no el aviso. `PullPortalLeads` lee los contactos de los **últimos 2 días**, de a páginas de 100, y los entrega a la bandeja.
  - La bandeja es `ReceiveInquiry` del módulo clients, a través del puerto `PortalLeadSink`, como `system:portal-sync` con `inquiries:receive`. No duplica por `(canal, ID externo)`, así que leer de nuevo es seguro y **no hace falta guardar hasta dónde se leyó**.
  - Corre **cada 10 minutos** con un cron de pg-boss (`PgBossEventBus.schedule`, `*/10 * * * *` en hora de Buenos Aires). Es el primer job programado del panel: pg-boss guarda el cron, así que con varias instancias corre una sola vez.
- **El aviso solo dispara una lectura.** `POST /api/webhooks/portals/zonaprop`:
  - Se autoriza con el header `x-norde-token`, comparado en tiempo constante contra `ZONAPROP_CALLBACK_TOKEN` (32 caracteres o más). Es una **excepción a la regla de firma**: un token fijo no prueba que el cuerpo no se alteró, pero el cuerpo no se usa.
  - También tiene rate limit por IP (120 por minuto) y un límite de 16 KB. Valida con Zod solo el tipo de evento, e ignora los eventos que no son contactos.
  - `NotifyPortalLeads` publica `portals.leads_arrived` por el outbox y se contesta enseguida. El job de esa cola corre `PullPortalLeads`.
  - Sin `PORTALS_ENABLED` o sin token, el endpoint responde 404.
- **Qué entra a la bandeja** (`leadInquiry`, en el dominio):
  - Solo los contactos con teléfono o email. Un anónimo que tocó "Ver teléfono" no entra.
  - Los textos de relleno del portal ("ANONYMOUS", "–") se descartan.
  - Sin texto, el mensaje dice qué pidió la persona ("Pidió que lo llamen").
  - La consulta queda con su propiedad si el aviso es de Norde (publicado o vinculado): se busca la publicación por el código del aviso. Si no, entra sin propiedad.
- **Activar los avisos** es una acción de Mi empresa → Portales (`EnablePortalLeadNotifications`, con `portals:manage`). Configura la URL `<BETTER_AUTH_URL>/api/webhooks/portals/zonaprop` con el token del entorno y suscribe los dos eventos. Se audita la URL y el nombre del header, nunca el valor.
- **No se loguean datos del contacto**: solo cuántos llegaron.

## Consecuencias

- Las consultas llegan aunque no se activen los avisos: tardan hasta 10 minutos. Con los avisos activados llegan en segundos, y si un aviso se pierde, la lectura siguiente lo cubre.
- Quien conozca el token puede disparar lecturas, pero no puede meter consultas: se leen de la API.
- En local no llegan avisos (la URL tiene que ser pública). Se prueban con los tests y, en UAT, desde Mi empresa.
- Un contacto con un teléfono o un email inválidos lo rechaza la bandeja y no entra. La corrida lo cuenta como rechazado.
- El mismo mecanismo sirve después para detectar los avisos que Zonaprop da de baja o vencen (`AVISO_ESTADO_PUBLICACION`).
