# ADR 0054: Suscripción a búsquedas desde la web, con doble confirmación

- **Estado**: aceptada
- **Fecha**: 2026-11-04
- **Complementa**: ADR 0021 (consultas de la web por webhook a `gestion`), ADR 0048 (links públicos de los envíos) e issue #106 (seguimientos automáticos).

## Contexto

La issue #208 pide que quien busca en el sitio pueda suscribirse a su búsqueda y recibir por email las propiedades que coincidan. Los seguimientos automáticos (#106) ya cruzan las búsquedas guardadas con el stock y mandan un resumen por email, pero solo para búsquedas que carga un asesor. Hacía falta:

- que un desconocido pueda dejar su email sin que alguien llene de mails la casilla de otro (Ley 25.326 pide consentimiento),
- elegir cada cuánto recibir el resumen (Norde no quiere un envío diario desde la web: cae en spam),
- y a quién se le asigna el contacto nuevo.

## Decisión

- **Doble confirmación**. El pedido queda **pendiente** en `search_subscriptions` (migración `0060`) con el nombre, el email, los criterios y la frecuencia, y se manda un email con un link a `/suscripcion/<token>`. Solo al confirmar se crea (o se encuentra) el contacto y se le guarda la búsqueda con envío automático. El token es como el de los envíos (ADR 0048): 32 bytes al azar, guardado como SHA-256. El link dura **72 horas**.
- **El pedido pasa por `gestion`**, como las consultas (ADR 0021): la web no tiene proveedor de email. `apps/web` firma el pedido con `INQUIRY_WEBHOOK_SECRET` y lo manda a `POST /api/webhooks/subscriptions/web` (`SUBSCRIPTION_WEBHOOK_URL`). `gestion` corre `RequestSearchSubscription` como `system:web` con el permiso `clients:subscribe-searches` y manda el email **dentro de la transacción**: si no sale, no queda nada.
- **La confirmación la escribe la web en el core**, como la baja de los envíos (ADR 0048): `ConfirmSearchSubscription` con `system:web`. La página pide un **clic** (los lectores de correo abren los links).
- **Tope por email**: 3 pedidos por día por casilla. Pasado el tope se responde igual, sin mandar nada: la web no puede averiguar qué casillas ya pidieron. Además, el rate limit por IP de la web (5 cada 10 minutos) y el del webhook.
- **Datos personales en un solo lugar**: al confirmar, el nombre y el email pasan al contacto y se borran de la suscripción. Las que vencen sin confirmar las borra el job diario de los seguimientos. La auditoría del pedido no guarda nombre ni email (todavía no es un contacto y no se podría suprimir con él); la de la confirmación lleva el `client_id`. La supresión del contacto se lleva sus suscripciones (`on delete cascade`).
- **Contacto**: si ya existe un contacto con ese email, la búsqueda se le suma y **mantiene su asesor** (si estaba en la papelera, vuelve). Si no, se registra con canal "Formulario web" a cargo del **asesor por defecto**: un usuario que un administrador marca en Usuarios (`users.default_assignee`, índice único parcial: como mucho uno). Marcar a otro se lo saca al anterior y suspenderlo se lo saca. Sin asesor por defecto, el contacto queda sin agente.
- **Aviso al asesor**: la confirmación emite `clients.search_subscribed` y la campana le avisa al asesor del contacto (tipo `search.subscribed`, ADR 0043).
- **Frecuencia por búsqueda**. `saved_searches.frequency` (`daily`, `every_3_days`, `weekly`, `monthly`) y `last_digest_at`. El resumen sigue corriendo una vez por día y sigue siendo un email por contacto, pero una búsqueda entra solo si nunca se le mandó un resumen o pasaron los días de su frecuencia (con 2 horas de margen por el horario del job). Lo que no le toca espera, no se descarta. Las destacadas (bajas de precio) entran todos los días. La web ofrece cada 3 días, semanal y mensual; el panel también la diaria. Las búsquedas de antes quedaron diarias; las nuevas del panel arrancan semanales.
- **Qué se guarda de la búsqueda**: lo que cruza el panel (operación, tipos, ubicaciones del catálogo, moneda y precio, ambientes mínimos). El resto de los filtros del listado (dormitorios, superficie, cochera, características, zona escrita, área del mapa) no se guarda, y el formulario lo avisa. El título que arma la web ("Departamentos en venta en Palermo, hasta USD 150.000") va en el email y es el nombre de la búsqueda en el panel.

## Consecuencias

- La web necesita `SUBSCRIPTION_WEBHOOK_URL` (y `INQUIRY_WEBHOOK_SECRET`); sin ella, el listado no ofrece suscribirse. `gestion` necesita `PUBLIC_SITE_URL` para armar el link.
- `/suscripcion/` no se indexa (`robots.txt`, `noindex`, `no-referrer`).
- Una búsqueda mensual con muchas coincidencias pendientes ocupa la ventana de 100 pendientes por contacto que mira el resumen; con el volumen de Norde no pasa, y si pasara, sale en el resumen siguiente.
- Darse de baja (#106) sigue dando de baja todas las búsquedas del contacto. Una suscripción nueva desde la web, confirmada, crea una búsqueda nueva con envío automático: es un consentimiento nuevo.
