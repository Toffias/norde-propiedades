# ADR 0030: Emprendimientos en Zonaprop: un aviso de desarrollo con sus unidades disponibles

- **Estado**: aceptada
- **Fecha**: 2026-10-16
- **Complementa**: ADR 0027 (publicación en Zonaprop), ADR 0028 (vincular avisos de Tokko) y ADR 0029 (consultas de Zonaprop).

## Contexto

La etapa 5 de Zonaprop (#14) publica los emprendimientos. En Norde, un emprendimiento es un aggregate del módulo properties y cada unidad es una propiedad con su `developmentId` (#7).

Open Navent publica los emprendimientos con su propio recurso:

- `PUT /v1/inmobiliarias/{codigo}/desarrollos/{codigoAviso}` crea o modifica el desarrollo. Recibe **siempre el array completo de unidades**, y cada unidad es un aviso con su propio `codigoAviso`, que tiene que ser único en todo el sistema.
- `DELETE` sobre el mismo recurso lo pone offline, con sus unidades. Si ya estaba offline, responde un error ("no está online").
- Con más de 15 unidades, Zonaprop lo procesa en diferido (`EN_ESPERA`).
- Se publica con un plan de emprendimientos (`DESARROLLOS_*`): los planes de propiedades no sirven.
- El tipo es 34 (vertical: edificios) o 33 (horizontal: barrios, complejos, loteos).
- Pide la etapa de la obra (`etapaDesarrollo`, el nombre de `/v1/desarrollo/etapas`) y la fecha de entrega (`fechaEntrega`, `MM-AAAA`).
- `/desarrollos/online/resumen` lista los emprendimientos online con sus unidades. Tokko carga la clave interna del emprendimiento con su código y cada unidad con un código terminado en el de la propiedad (`DEV53838-NBU71286 AP8090293`).

Hasta ahora, la publicación (`Listing`) era solo de propiedades, aunque la tabla `portal_listings` ya tenía `development_id` y la restricción de un solo dueño desde la migración de #14.

## Decisión

- **La publicación tiene un dueño**: `Listing.owner` es `{ kind: 'property' | 'development', id }` y reemplaza a `propertyId`.
  - No hace falta migración: se usan `property_id` o `development_id` de `portal_listings` (uno de los dos, por `portal_listings_single_owner`).
  - Hay como mucho una publicación por emprendimiento y portal (`portal_listings_portal_development_uq`).
  - Los eventos de la publicación llevan `ownerKind` y `ownerId`. La auditoría va contra el dueño: `development.portal_published` aparece en el historial del emprendimiento.
- **El contenido que se manda es una unión**: `PortalListingContent` es `PropertyListingContent | DevelopmentListingContent`, con `kind`.
  - La huella de una propiedad no cambia (no lleva `kind`), así que los avisos de antes no se reenvían.
  - El conector recibe `kind` en `close`, para dar de baja en el recurso que corresponde.
- **Qué va en el aviso** (reglas del core):
  - Solo las unidades **disponibles y con precio** (`publishableUnits`). Una unidad "a consultar" no se publica: Zonaprop exige precio.
  - El emprendimiento se ofrece mientras está "Comercializando" y tiene alguna unidad para publicar (`developmentAvailability`). Cargando información o sin unidades, el aviso queda **en pausa** (offline en Zonaprop) y vuelve solo cuando hay unidades. En la papelera, se cierra.
  - Se publica a pedido desde la pestaña Difusión del emprendimiento (`RequestDevelopmentPublication`), con un plan de emprendimientos con créditos.
- **El contenido lo arma el panel** (`developmentListingSourceReader`):
  - Lee la ficha del emprendimiento, sus fotos, el contacto de la sucursal y las unidades disponibles, de a páginas del listado del panel, con un tope de 500.
  - Cada unidad se arma con el mismo lector que una propiedad.
  - `ListShareablePhotos` acepta `developmentId`, con `developments:read`.
- **El aviso se actualiza solo**:
  - `properties.development_changed` sale en cada guardado del emprendimiento, como `property_changed`.
  - `property_changed` de una unidad lleva sus `developmentIds`.
  - Los cambios de fotos del emprendimiento también actualizan el aviso.
  - Todo pasa por `RequestListingSync`, que acepta `{ developmentId }`. Si el contenido no cambió, el job no llama a Zonaprop.
- **Códigos en Zonaprop**:
  - El del emprendimiento es el ID de la publicación sin guiones (como el de una propiedad).
  - El de cada unidad es `U` más el ID de la propiedad sin guiones. Así no choca con los otros, no hay que guardarlo, y una consulta que llega por una unidad se traduce a su propiedad (`PortalLead.unitPropertyId`).
  - Una consulta por el aviso del emprendimiento entra con el emprendimiento (`developmentId` en `ReceiveInquiry`).
- **Vincular los emprendimientos de Tokko** (`ListRemoteDevelopments` y `LinkDevelopmentListing`):
  - Mi empresa → Portales → Avisos en Zonaprop tiene la vista Emprendimientos. El emparejamiento es por código, con `FindDevelopmentsByCode` (filtro `codes` del listado, por `developments_code_uq`).
  - Desde la ficha, se vincula pegando el link.
  - Se asocia el emprendimiento y cada unidad del portal cuya referencia coincide con el código de una unidad de Norde. Una unidad que no se pudo asociar no frena el vínculo: el próximo envío manda la lista completa y reemplaza las del portal.
  - Igual que con las propiedades, el aviso queda como lo dejó Tokko hasta que cambie algo.
- **MercadoLibre** no publica emprendimientos todavía: la cuenta de emprendimientos de ML queda con `publishes: []`, y su conector rechaza un contenido de emprendimiento.

## Consecuencias

- Una unidad no se publica sola: se ve y se publica desde su emprendimiento.
- Si una unidad reservada se libera, el emprendimiento se reenvía con ella. Si se vendió la última, el aviso sale del portal y libera el crédito.
- En el sandbox, la cuenta tiene 0 créditos de Desarrollos home. El cuerpo pasa la validación de Zonaprop hasta el control de créditos, pero un desarrollo online no se probó de punta a punta.
- `asociar` sigue respondiendo 403 hasta que Zonaprop habilite el permiso (ADR 0028). Que asociar una unidad funcione igual que un aviso es lo esperado, pero no se pudo probar.
- Un emprendimiento con más de 500 unidades disponibles se publica con las primeras 500 y queda un aviso en el log.
