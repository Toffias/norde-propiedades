# ADR 0033: Vincular los avisos que Tokko publicó en MercadoLibre

- **Estado**: aceptada
- **Fecha**: 2026-10-18
- **Complementa**: ADR 0024 (publicación en MercadoLibre) y ADR 0028 (vincular avisos de Zonaprop).

## Contexto

La etapa 3 de MercadoLibre (#14) toma los avisos que hoy publica Tokko en la cuenta de propiedades, sin republicarlos, para que conserven su antigüedad, sus visitas y sus consultas. Zonaprop ya lo hace (ADR 0028). Lo que vimos en Tokko el 2026-10-18:

- Norde tiene unas 180 avisos en ML para 161 propiedades: **un aviso por operación**, como los publica Norde (ADR 0024).
- Tokko **publica cada unidad de un emprendimiento como un aviso suelto** en la cuenta de propiedades (opción "Publicación automática de unidades de emprendimientos de manera individual").
- El código de referencia de Tokko es prefijo + ID (`NPH456198`). En las unidades es el del emprendimiento más el de la unidad (`NBU70377 AP7794303`).
- Desde Tokko **no se ve dónde pone el código en el aviso de ML**, y la API de ML pide token hasta para leer un aviso. Tokko sí muestra el link del aviso de cada propiedad.

## Decisión

- **MercadoLibre · Propiedades vincula avisos existentes** (`linksExisting`). Usa los mismos casos de uso que Zonaprop (`ListRemoteListings` y `LinkPortalListing`), con dos diferencias:
  - **El aviso es de una operación.** `RemoteListing` trae `operation` y `listingType`. La publicación vinculada es la de esa operación de la propiedad, con el tipo del aviso (plata → simple; oro → destacado).
    - La operación sale del atributo `OPERATION` del aviso o, si no está, de la categoría (la inversa de la tabla del ADR 0024).
    - Si no se sabe, no se vincula (`RemoteListingOperationUnknown`). Si la propiedad no ofrece esa operación, tampoco (`OperationNotOffered`).
  - **Vincular no toca MercadoLibre.** El ID del aviso (`MLA…`) pasa a ser el `externalId` de la publicación, y desde ahí la sincronización de siempre lo actualiza cuando cambia la propiedad.
- **Las unidades se vinculan como avisos sueltos** (`unitsAsListings` en el catálogo de portales, solo en MercadoLibre · Propiedades). Es una excepción a "las unidades van con su emprendimiento":
  - La pestaña Difusión de una unidad muestra solo esos portales, y solo permite vincular, no publicar uno nuevo.
  - Publicar una unidad sigue sin estar permitido. Qué pasa con estos avisos cuando se publique el emprendimiento en ML lo decide la etapa 4.
- **El código del aviso**, para proponer la propiedad, sale del campo del vendedor (`seller_custom_field`) o del atributo `SELLER_SKU`. Si trae el del emprendimiento adelante, queda el último tramo (el de la unidad). Si no está en ninguno, el aviso se lista sin propuesta y se vincula desde la ficha pegando su link (`MLA-…`), que Tokko muestra en cada propiedad. **Pendiente:** confirmarlo con un aviso real cuando la cuenta de Norde esté conectada.
- **`MercadoLibreListingCatalog`** (infra):
  - Lista los avisos activos de la cuenta (`/users/{id}/items/search?status=active`, paginado) y los lee con el multiget de items.
  - Para vincular uno por su ID, lo acepta si es de la cuenta y está activo o pausado: Tokko pausa los de las reservadas.
  - `PortalListingCatalogsByProvider` elige el catálogo por proveedor.
- Mi empresa → Portales → **Avisos en MercadoLibre** (`/mi-empresa/portales/avisos?portal=mercadolibre`) lista los avisos con su operación y la propiedad propuesta. La pestaña Difusión permite "Vincular un aviso existente" en cada operación.

## Consecuencias

- **Antes de vincular en producción hay que apagar la publicación de Tokko en MercadoLibre.** Si no, los dos sistemas pisan el mismo aviso.
- Un aviso vinculado queda como lo dejó Tokko hasta que cambie algo de la propiedad. El primer cambio manda el contenido de Norde (título, descripción, fotos y contacto).
- Los avisos pausados no aparecen en el listado (solo se piden los activos). Se vinculan desde la ficha.
- Las consultas de los avisos vinculados entran con su propiedad (ADR 0032). Las de los que todavía no se vincularon entran sin propiedad.
