# ADR 0031: Conciliación diaria de los avisos y cupo de los paquetes de MercadoLibre

- **Estado**: aceptada
- **Fecha**: 2026-10-17
- **Complementa**: ADR 0024 (publicación en MercadoLibre), ADR 0022 (cuentas de MercadoLibre) y ADR 0021 (jobs en `apps/gestion`).

## Contexto

La etapa 2a de #14 lleva a MercadoLibre lo que cambia en Norde, pero no al revés. MercadoLibre también cambia los avisos por su cuenta:

- **Los vence.** Cada aviso de inmuebles tiene una vigencia por categoría y operación (en MLA, 270 días la venta de departamentos y casas; 90 y 60 días el alquiler). Al llegar a `stop_time`, el aviso pasa a `closed` con sub-estado `expired`. También se cierra si se agota el cupo del paquete.
- **Los modera.** Un aviso puede quedar `under_review` o `inactive`, o `paused` con el tag `moderation_penalty`: por un cambio de precio inusual, porque nadie lo mira o porque alguien lo denunció como no disponible. El motivo se lee en `/moderations/last_moderation/{id}-ITM` (la redacción `REASON`).
- **Los pausan o los borran desde su sitio** personas con acceso a la cuenta.

Hasta ahora la publicación seguía "Publicada" en la ficha. Además, la prueba en UAT mostró que una cuenta sin paquete recibe 402 al publicar: el equipo no tenía cómo ver cuánto cupo le queda.

## Decisión

### Conciliación diaria

- **Un job diario** (`portals.reconcile-listings`, a las 6 en Buenos Aires, en `apps/gestion`) corre `ReconcileListings` por cada cuenta con `reconciles` en el catálogo de portales: hoy, las dos de MercadoLibre. Zonaprop no vence ni modera avisos, así que no se concilia.
- Recorre las publicaciones con aviso vivo (publicadas, pausadas o con error) **por lotes de 50**, ordenadas por ID (`findLiveOnPortal`), y le pregunta a MercadoLibre por todas juntas (multiget de `/items`, de a 20).
- Cada cambio se guarda **con la publicación bloqueada**, como `SyncListing`, y se audita contra la propiedad por `system:portal-sync`, con el motivo.
- **Qué se refleja** (`Listing.reconcile`, en el dominio):
  - **Cerrado en ML** (vencido, borrado, dado de baja por moderación o ya inexistente): la publicación queda **dada de baja**, con el motivo a la vista. Volver a mostrarlo es "Volver a publicar", como cualquier aviso cerrado: un aviso nuevo, que consume cupo.
  - **Pausado en ML** (por moderación, por falta de pago o desde su sitio): queda **pausada**, con el motivo. No se reactiva sola: el equipo resuelve la causa en MercadoLibre y toca **Sincronizar** en la ficha. Si el equipo ya la había pausado, no se muestra motivo.
  - **Activo en ML**: si estaba pausada por el portal, vuelve a "Publicada". Si el equipo la había pausado, se pide sincronizar y el job la vuelve a pausar.
  - Los estados de paso (`not_yet_active` o `picture_download_pending` mientras ML descarga las fotos) y los desconocidos no cambian nada.
- **No hay evento nuevo.** El cambio queda en la publicación y en el historial de la propiedad. Nadie reacciona hoy a lo que conciliamos.
- Si MercadoLibre no responde, la corrida termina con error en el log y se vuelve a intentar al día siguiente. Lo que ya se concilió queda guardado.

### Cupo de los paquetes

- Mi empresa → Portales muestra, en cada tarjeta de MercadoLibre conectada, los **paquetes activos** de la cuenta: nombre, para qué sirve (publicaciones, destaques o emprendimientos), vencimiento y el cupo libre de cada tipo de aviso (Plata, Oro, Oro Premium).
- Se lee **de MercadoLibre en el momento** (`/users/{id}/classifieds_promotion_packs?status=active`), como los créditos de Zonaprop. No se guarda.
- Es una query aparte (`GetPortalPackages`), no los créditos de Zonaprop: un paquete de ML tiene cupos por tipo de aviso y no se elige al publicar.
- Lo ven quienes tienen `portals:manage` o `portals:publish`.

### Infra

- `MercadoLibreAccountReader` implementa los dos puertos nuevos (`PortalListingStateReader` y `PortalPackageReader`), con el mismo token de la cuenta que la publicación (`MercadoLibreTokens`). Traduce los estados y sub-estados de ML a los motivos en español.
- Un 401 pide reconectar la cuenta. Un 5xx, un 429, un error de red o una respuesta que no se entiende es "MercadoLibre no respondió".

## Consecuencias

- Un aviso vencido o moderado se ve en la ficha al día siguiente, no en el momento. Para enterarse al instante habría que suscribirse a las notificaciones de `items` de MercadoLibre. Queda para cuando haga falta.
- La conciliación no reactiva nada sola: reactivar un aviso moderado sin resolver la causa vuelve a moderarlo.
- Un paquete ilimitado no informa cupo: la tarjeta dice "Sin límite de avisos".
- La consulta por lotes usa el índice `portal_listings_portal_status_idx`. Con los volúmenes de Norde (cientos de avisos) no hace falta otro.
