# ADR 0034: Emprendimientos en MercadoLibre

- **Estado**: aceptada
- **Fecha**: 2026-10-18
- **Complementa**: ADR 0024 (publicación en MercadoLibre), ADR 0030 (emprendimientos en Zonaprop) y ADR 0033 (vincular avisos de MercadoLibre).

## Contexto

La etapa 4 de MercadoLibre (#14) publica los emprendimientos en la cuenta **MercadoLibre · Emprendimientos**, la que tiene el paquete de emprendimientos (ADR 0022). Lo que dice la documentación de ML (guías "Desarrollos inmobiliarios", "Variaciones" y "Actualiza las variaciones de tu inmueble"), relevado el 2026-10-18:

- Un emprendimiento es **un ítem** con las unidades como **variaciones**. Cada variación tiene su precio, su cantidad, sus atributos (`attribute_combinations`, que la identifican: no puede haber dos iguales) y sus fotos.
- Solo hay cuatro categorías "Emprendimientos", **todas de venta**: departamentos (`MLA401806`), casas (`MLA401805`), oficinas (`MLA401804`) y terrenos (`MLA401803`).
- Atributos obligatorios:
  - Del emprendimiento: `DEVELOPMENT_NAME` y `POSSESSION_STATUS` (venta en blanco, venta en verde, pronta entrega, entrega inmediata).
  - De cada variación: `UNIT_NAME`, `MODEL_NAME` y, según la categoría, superficies, ambientes, dormitorios, baños y cocheras.
- Las variaciones van en la **moneda del ítem**. El precio del ítem lo pone ML: el de la variación más barata.
- **Toda variación tiene que tener una foto.** La variación las referencia por ID o por URL (`picture_ids`), y tienen que estar también en las fotos del ítem. Hasta 300 variaciones y 200 fotos por ítem (100 en terrenos).
- Para actualizar se manda el ítem con **la lista completa de variaciones**: las que van con su ID se actualizan, las que van sin ID se crean y las que no van, ML las borra.
- El paquete de emprendimientos lo activa ML a pedido: permite **un solo emprendimiento por activación**, y la cuenta no puede publicar avisos comunes.
- Las cotizaciones de una unidad llegan como leads de VIS Leads (tipo `quotation`), con el ID de la cotización. `/quotations/{id}` trae la variación cotizada.

## Decisión

- **MercadoLibre · Emprendimientos publica emprendimientos** (`publishes: ['development']`), con los mismos casos de uso que Zonaprop (`RequestDevelopmentPublication`, `SyncListing`, `GetDevelopmentListings`). Sin plan. No vincula avisos existentes: no vimos que Tokko publique emprendimientos en ML.
- **Las unidades del aviso** (`mercadolibre-development.ts`, traducción pura en infra) son las disponibles, **en venta y con precio**, del **tipo de unidad más común** entre las que ML publica como emprendimiento (a la par: departamentos, casas, oficinas, lotes). Ese tipo da la categoría. Las demás (cocheras, locales, unidades solo en alquiler) no entran. Decisión de Norde.
- **Monedas distintas bloquean la publicación.** Si las unidades del aviso tienen precios en USD y en ARS, no se publica y la ficha lo dice. Decisión de Norde.
- **Cada variación**:
  - `UNIT_NAME`: piso y unidad ("Piso 3 · B"), o el código de la unidad si no los tiene. Si dos se llaman igual, va el código entre paréntesis.
  - `MODEL_NAME`: la tipología ("2 ambientes", "Casa de 3 dormitorios", "Lote de 300 m²").
  - Los atributos obligatorios de la categoría. Las cocheras vacías van como 0, como en las propiedades.
  - `seller_custom_field`: **el ID de la unidad**. Con él la sincronización reconoce las variaciones ya publicadas (van con su ID), y una cotización se asigna a la unidad cotizada.
  - Hasta 3 fotos propias, por URL. Una unidad sin fotos usa la portada del emprendimiento. El ítem lleva hasta 30 fotos del emprendimiento y las de las unidades, hasta el tope de la categoría.
- **El piso y la unidad entran a lo que se publica** (`ListingSource.unitDesignation`), solo en las unidades de un emprendimiento. El aviso de una propiedad nunca los lleva (ADR 0024).
- **El tipo de aviso lo da el paquete.** Al crear, el conector lee los paquetes de emprendimientos activos de la cuenta (`/users/{id}/classifieds_promotion_packs?package_content=developments`) y usa el tipo del que tiene cupo. Sin paquete con cupo, se rechaza con un motivo claro. El aviso de un emprendimiento **no se pasa a simple o destacado** (`ListingTypeFixed`, regla del dominio).
- **Sin unidades, el aviso se pausa sin mandar contenido**: ML no admite un ítem sin variaciones.
- **Las cotizaciones** (`quotation`) entran a la bandeja con un tipo propio (`quote`: "Pidió la cotización de una unidad."). La unidad sale de `/quotations/{id}?caller.type=seller`: la variación trae el ID de la unidad. Si no lo trae (un aviso de otro sistema), la consulta queda con el emprendimiento.
- **Los avisos sueltos de las unidades que publicó Tokko** en la cuenta de propiedades (ADR 0033) **conviven** con el emprendimiento: siguen vinculados y sincronizados, y se cierran solos cuando la unidad se vende. Decisión de Norde.

## Consecuencias

- La huella del contenido suma el nombre del emprendimiento y el piso y la unidad de cada unidad. Los avisos de emprendimientos en Zonaprop y los avisos sueltos de unidades se reenvían una vez, con el mismo contenido.
- Un emprendimiento con unidades de varios tipos publica solo las del tipo más común. Para publicar las demás haría falta otro paquete y otro ítem: no está previsto.
- Como el paquete alcanza para un solo emprendimiento, cada emprendimiento nuevo en ML necesita que ML vuelva a activar el paquete.
- **Pendiente de confirmar con la cuenta real:** que el tipo de lead de las cotizaciones sea `quotation` (la guía nombra el subtópico, no el `contact_type`) y que ML acepte las fotos de las variaciones por URL en una publicación de inmuebles (la guía general de variaciones lo permite).
