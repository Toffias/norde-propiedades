# ADR 0048: Links públicos de los envíos de propiedades

- **Estado**: aceptada
- **Fecha**: 2026-10-27
- **Complementa**: ADR 0021 (procesos en segundo plano en `gestion`) y ADR 0023 (lo que la web lee del core).

## Contexto

El asesor le manda propiedades a un cliente por email o WhatsApp (#104). El cliente abre un link en el sitio público, ve las propiedades y marca cuáles le gustan; eso vuelve a la actividad del contacto en el panel y dispara reglas de la oportunidad. El link es lo único que separa a un desconocido de un envío: no puede exponer IDs ni datos del cliente, tiene que vencer y poder cortarse. Las tablas `shared_listings` y `shared_listing_items` existían desde el modelo inicial, sin código.

## Decisión

- **Token**: 32 bytes al azar en base64url (43 caracteres), generado en infra (`RandomSharedListingTokens`). En la base queda solo su **SHA-256** (`token_hash`, índice único): con una copia de la base no se arma un link. El link es `<PUBLIC_SITE_URL>/e/<token>`.
- **Vigencia**: 90 días desde el envío (decisión de Norde) y se puede **revocar** desde la pestaña Envíos. Vencido o revocado, la página lo dice y no acepta aperturas ni reacciones.
- **El sitio escribe en el core**: `apps/web` llama a `GetSharedListing`, `OpenSharedListing` y `ReactToSharedListing` por su container, con `system:web` y el permiso `clients:respond-to-listings`, como lo prevé su `CLAUDE.md` para los formularios. No pasa por un webhook de `gestion`: es la misma base y los eventos van al outbox, que procesa el relay de `gestion`.
- **La apertura la registra el navegador**: la página se arma sin escribir nada y un componente cliente llama a una Server Action al montarse. Las vistas previas de links (WhatsApp, clientes de correo) no corren JavaScript y no cuentan como apertura.
- **Borde público**: las Server Actions validan con los contracts del core (el token con su formato exacto) y limitan por IP en memoria (30 aperturas y 60 reacciones cada 10 minutos), como el formulario de consultas. Un token mal formado, desconocido, vencido o revocado responde lo mismo hacia afuera.
- **La página no se indexa** (`noindex`, `/e/` en `robots.txt`, fuera del sitemap) y pide `no-referrer`, para que el token no viaje a otro sitio al seguir un link.
- **Email**: el caso de uso arma el contenido con un puerto (`SharedListingEmails`, plantilla HTML en infra) y lo manda con `Mailer` **dentro de la transacción**: si Resend falla, el envío no queda registrado. `OutgoingEmail` suma un `html` opcional.
- **WhatsApp**: el caso de uso devuelve el link `wa.me` con el mensaje y el link escritos; el panel lo abre en el WhatsApp del asesor. Un celular argentino cargado sin el 9 de móvil se completa para `wa.me`.
- **Oportunidad**: `shared_listings.opportunity_id` (migración `0048`, solo expand) guarda la oportunidad abierta más reciente al enviar. Es la que mueven las reglas "tras enviar email o WhatsApp", "tras me gusta" y "tras no me gusta" (`opportunity_settings.stage_after_*`), con el handler idempotente por `source_event_id`.
- **Auditoría**: el envío, la primera apertura, cada reacción y la revocación quedan en el historial del contacto, sin el email ni el teléfono del destinatario.

## Consecuencias

- `gestion` necesita `PUBLIC_SITE_URL`; sin ella, enviar responde que falta configurarlo.
- La web suma una UoW de `clients` a su container: escribe en el core sin pasar por `gestion`.
- El rate limit en memoria alcanza con una instancia de la web; si se escala, se mueve a la base o a un proxy.
- Antes de enviar se pregunta si cada propiedad se ve en el sitio (`GetPropertyDetail` con el actor de la web): un envío no lleva propiedades que el cliente no podría abrir. Si después se despublica, su tarjeta dice que ya no está disponible.
