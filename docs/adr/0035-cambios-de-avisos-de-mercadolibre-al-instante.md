# ADR 0035: Cambios de los avisos de MercadoLibre al instante

- **Estado**: aceptada
- **Fecha**: 2026-10-18
- **Complementa**: ADR 0031 (conciliación diaria) y ADR 0032 (notificaciones de MercadoLibre).

## Contexto

La conciliación diaria (ADR 0031) refleja una vez por día lo que MercadoLibre hizo con los avisos: los vencidos, los cerrados, los pausados por moderación. Entre una corrida y la otra, la pestaña Difusión puede mostrar "Publicada" un aviso que ML ya dio de baja.

MercadoLibre avisa cada cambio de un ítem con el tópico `items` (`resource: /items/MLA…`, `user_id` de la cuenta), a la misma URL de notificaciones de los contactos (ADR 0032). Igual que esas notificaciones, no viene firmada y ML espera un 200 en 500 ms.

## Decisión

- **El webhook de MercadoLibre** (`/api/webhooks/portals/mercadolibre`) acepta también el tópico `items`. Saca el ID del aviso del `resource` y llama a `NotifyListingChanged`. Un `resource` con otra forma se acepta con 200 y se ignora.
- **`NotifyListingChanged`** (core) busca la cuenta del proveedor por su `user_id`, solo entre las que se concilian, y la publicación con ese aviso. Si es de Norde y sigue viva, publica `portals.listing_changed_on_portal`. Si no (un aviso de Tokko sin vincular, o una cuenta que no es de Norde), no hace nada. La notificación no es un dato: solo dice qué aviso mirar.
- **El job `reconcile-listing`** corre `ReconcileListing`: lee el estado de ese aviso con el mismo lector de la conciliación diaria (`PortalListingStateReader`) y lo aplica con la misma regla (`Listing.reconcile`, con la publicación bloqueada). Se audita por `system:portal-sync`. La regla compartida queda en `applyRemoteState` (`listing-support.ts`).
  - Si ML no responde, el job reintenta. Si sigue sin responder, lo cubre la conciliación diaria.
- **La conciliación diaria sigue** como respaldo: ML puede no mandar una notificación, o desactivar el tópico.

## Consecuencias

- **Cada cambio que hace el propio sistema** (publicar, actualizar, pausar) también genera una notificación de `items`, y con ella una lectura del aviso. Esa lectura no cambia nada, porque el estado coincide con lo pedido. Es una lectura por cambio, dentro del rate limit del endpoint.
- **En la app de MercadoLibre hay que suscribir el tópico `items`**, además de `vis_leads`.
- Lo que ML cambia del contenido (por ejemplo, el precio desde su sitio) no se trae: el sistema es la fuente del contenido y lo vuelve a mandar en el próximo cambio de la propiedad.
