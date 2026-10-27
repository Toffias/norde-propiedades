# ADR 0047: Robustez de la integración con Zonaprop

- **Estado**: aceptada
- **Fecha**: 2026-10-26
- **Modifica**: ADR 0027 (publicación), ADR 0029 (consultas, "sin cursor") y el catálogo de portales (`reconciles` de Zonaprop).

## Contexto

La auditoría de la integración (#162) encontró avisos que quedaban online cuando no tenían que estar, consultas que se perdían y cambios de Zonaprop que el panel nunca veía. Nunca hubo una consulta real ni un emprendimiento online de punta a punta, así que varias decisiones se tomaron con la documentación de Open Navent.

## Decisión

**Publicación**

- **Pausar nunca falla por el contenido.** Pausar en Zonaprop es un `DELETE` sin cuerpo: si el contenido no se puede mandar (sin precio, descripción corta), se pausa igual y el contenido se manda al reactivar.
- **Sin precio, el aviso se baja.** Una propiedad disponible que se queda sin ninguna operación con precio pausa su aviso (offline en Zonaprop, pausado en MercadoLibre) con el motivo a la vista, y vuelve sola cuando tiene precio. Antes quedaba online con el precio viejo y la publicación en error. Si la propiedad dejó de ofrecer la operación del aviso (MercadoLibre), sigue siendo un error.
- **Reactivar revisa créditos** del plan, como publicar y cambiar de plan. El paso automático reservada → disponible no los revisa: si no hay, queda en error y lo toma el reintento diario.
- **Reintento diario** (`portals.retry-failed-listings`, 6:30): pide sincronizar las publicaciones en error de cada portal, por tandas (`RequestPortalListingsSync`, índice parcial `portal_listings_failed_idx`). Cubre el portal caído más allá de los reintentos de pg-boss y los créditos que se compraron después.
- **Cambios que van en todos los avisos**: el pie para portales o el link de la web (`settings.company_settings_changed`, secciones `portals` y `general`) y el contacto de una sucursal (`identity.branch_updated`, evento nuevo) piden sincronizar todas las publicaciones vivas. Las que no cambiaron no llaman al portal (huella del contenido).
- **Fotos de una unidad**: el evento de media no trae el emprendimiento; la suscripción lo busca (`GetPropertySummaries`) y reenvía el aviso del emprendimiento.
- El `PUT` de un emprendimiento tiene 120 segundos de timeout (el resto, 15).

**Conciliación**

- Zonaprop pasa a `reconciles: true`. `ZonapropListingStates` lee `GET /v1/inmobiliarias/{codigo}/avisos/{codigoAviso}/status` de a cinco: `ONLINE` es activo; `OFFLINE`, pausado con el motivo (Zonaprop no da de baja para siempre: el aviso vuelve con otro envío). `EN_ESPERA`, otro estado o un 404 (por ejemplo, un emprendimiento) quedan como estaban.
- El estado trae `idAvisoNavplat`: la conciliación guarda el link de los avisos que no lo tenían.
- Una publicación que Norde ya pausó (el equipo, una reserva, sin precio) conserva su motivo aunque el portal la informe offline. Si el portal reactiva una pausada, se pide sincronizar: si la propiedad sigue reservada o sin precio, se vuelve a pausar.

**Consultas**

- **Cursor**: `portal_accounts.leads_pulled_at` guarda cuándo empezó la última lectura completa. La próxima lee desde ahí (como mínimo los últimos 2 días, como máximo 14). Una lectura cortada por el tope de páginas o por un error no lo mueve. Es estado técnico del job: no se audita, como `last_synced_at` de las publicaciones.
- **Un contacto inválido no pierde la consulta**: si el teléfono no es válido pero el email sí (o al revés), entra con el válido y el otro queda escrito en el mensaje. Es una regla del dominio de `clients` (`inquiryContact`) y vale para todos los canales. Los rechazos se loguean con el ID del portal y el motivo, sin datos del contacto.
- **Avisos de Tokko sin vincular**: si el código del aviso no es de Norde, el adaptador lee la clave interna del resumen de avisos online por `idAvisoNavplat` (recordada en memoria) y la consulta queda con la propiedad de ese código (o del último tramo, en las unidades de Tokko).
- Los códigos de aviso y de unidad de Norde se comparan sin distinguir mayúsculas.
- Una `fecha` sin offset se lee como hora de Buenos Aires (UTC-3).

## Consecuencias

- Migraciones solo de expansión: `0046` (columna `leads_pulled_at`, nula) y `0047` (índice parcial).
- La conciliación diaria hace una llamada por aviso de Zonaprop. Con cientos de avisos son unos minutos a las 6:00.
- La ficha lee los créditos con un cache de 2 minutos (`CachedPortalCredits`, solo para mostrar): abrir Difusión seguido no llama a Zonaprop cada vez. Publicar, reactivar y cambiar de plan leen en vivo.
- Queda por verificar con datos reales: la forma de `vencimientos` en `disponibilidad` (sin documentar, no se muestra todavía), el `status` de un emprendimiento, el cambio de plan sobre un aviso online y `publicacion` en cada unidad.
