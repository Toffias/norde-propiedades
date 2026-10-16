# ADR 0028: Vincular los avisos que Tokko publicó en Zonaprop

- **Estado**: aceptada
- **Fecha**: 2026-10-16
- **Complementa**: ADR 0026 (Zonaprop como integrador) y ADR 0027 (publicación en Zonaprop).

## Contexto

Hoy Tokko publica los avisos de Norde en Zonaprop. Al pasar al sistema, republicarlos haría perder su antigüedad, sus visitas y sus consultas, y consumiría créditos. La API de Open Navent permite tomarlos:

- `GET /v1/inmobiliarias/{codigo}/avisos/online/resumen` lista los avisos online de la cuenta, paginado por Zonaprop (`pageable.page` desde 0 y `pageable.size`). Cada uno trae su ID (`idAvisoNavplat`), su código (`codigoAviso`), la clave interna con que lo cargó la inmobiliaria (`claveInterna`), el plan y el tipo (aviso, emprendimiento o unidad). Se puede filtrar por `idAvisoNavplat`.
- `PUT /v1/inmobiliarias/{codigo}/avisos/{codigoAviso}/asociar/{idAviso}` asocia el aviso al integrador con el código que elige: desde ahí, Norde lo modifica con ese código.
- La API no devuelve el link público del aviso, pero `https://www.zonaprop.com.ar/propiedades/clasificado/-{idAviso}.html` redirige al aviso con su título (probado con un aviso real).

## Decisión

- **El catálogo dice qué portales vinculan avisos existentes** (`linksExisting`: hoy solo Zonaprop).
- **Puerto `PortalListingCatalog`** (`online` y `link`), implementado por `ZonapropListingCatalog`. Las páginas se piden con `offset` y `limit`, que infra traduce a las de Zonaprop.
- **Emparejamiento por código.** `ListRemoteListings` lista una página de avisos online y busca la propiedad cuyo código de referencia es la clave interna (o el código del aviso), con el puerto `PropertyCodeLookup`. El panel lo implementa con la consulta nueva `FindPropertiesByCode` del módulo properties: un filtro `codes` del buscador, sobre el índice único de `code`. También marca los avisos ya vinculados (`findByExternalIds`).
- **Vincular** (`LinkPortalListing`, con `portals:publish`) desde Mi empresa → Portales → Avisos en Zonaprop, o desde la ficha pegando el link del aviso (el contract toma el número del final del link).
  - El aviso tiene que estar online en la cuenta, no ser un emprendimiento ni estar vinculado a otra publicación, y la propiedad no puede tener ya un aviso en el portal.
  - El plan es el que informa Zonaprop. Si no lo informa, se pide (`PlanRequired`).
  - Las llamadas al portal van antes de la transacción. `asociar` usa el código de la publicación (su ID sin guiones), que pasa a ser el `externalId`.
  - **El aviso queda como lo dejó Tokko**: la publicación nace publicada con la huella del contenido de hoy (`Listing.linked`) y no pide sincronizar. El primer cambio de la propiedad lo actualiza con la sincronización de siempre.
  - Una publicación dada de baja de la misma propiedad se reutiliza (`Listing.adopt`): hay una sola por portal y propiedad.
  - Se audita `property.portal_listing_linked` contra la propiedad, con el ID del aviso.
- **Link del aviso.** El conector de Zonaprop arma el link con el `idAviso` que devuelve al crear o modificar. `PortalConnector.update` devuelve el estado y el link (`PortalListingUpdate`), así los avisos ya publicados toman el link en su próxima sincronización.

## Consecuencias

- **Permiso pendiente:** en el sandbox, `asociar` responde `403 no_permission` con las credenciales de NordeCRM, aunque publicar funciona. Hay que pedirle a Open Navent (integracion@ar.quintoandar.com) que habilite asociar avisos para el integrador. Mientras tanto, el panel lo explica con ese mensaje.

- Antes de vincular en producción hay que **apagar la publicación de Tokko en Zonaprop**: si no, Tokko seguiría modificando los avisos que maneja Norde.
- Los emprendimientos y sus unidades quedan para la etapa 5.
- Un aviso cuya clave interna no coincide con ningún código se vincula a mano desde la ficha.
- El link solo abre en producción: los avisos del sandbox no están en el sitio público.
