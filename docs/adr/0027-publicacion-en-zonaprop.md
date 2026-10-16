# ADR 0027: Publicación de propiedades en Zonaprop

- **Estado**: aceptada
- **Fecha**: 2026-10-16
- **Complementa**: ADR 0024 (publicación en MercadoLibre) y ADR 0026 (Zonaprop como integrador).

## Contexto

La etapa 2 de Zonaprop (#14) publica las propiedades desde la pestaña Difusión, como MercadoLibre. La API de Open Navent es distinta en cosas que tocan el modelo:

- **Un aviso puede llevar varias operaciones** (`precios` con `VENTA`, `ALQUILER`, `ALQUILER_TEMPORAL`), y cada aviso consume un crédito del plan con el que se publica. El modelo de ADR 0024 tiene una publicación por portal, propiedad y operación.
- **Planes en lugar de simple o destacado.** La cuenta tiene planes contratados (`SIMPLE`, `HOME`, `DESARROLLOS_HOME`…) con créditos por plan; los `DESARROLLOS_*` son para emprendimientos.
- **"Crear o modificar" con `PUT`** sobre un código de aviso que elige el integrador, y **`DELETE` pone el aviso offline.** No hay pausa.
- **La ubicación es un ID de su árbol** (`V1-C-1003694`). Hay un endpoint que lo devuelve a partir de la latitud y la longitud.
- Hasta 50 fotos por URL, que Zonaprop descarga al procesar el aviso.

## Decisión

- **El catálogo dice cómo se arma el aviso**: `listingScope` es `operation` (MercadoLibre) o `property` (Zonaprop), y `choosesPlan` dice si se elige un plan del portal.
  - En Zonaprop, la publicación no tiene operación: lleva todas las operaciones con precio (las "a consultar" no se mandan). Sin ninguna con precio, no se publica.
  - El plan se guarda en la publicación (`portal_listings.plan`); `listing_type` queda para MercadoLibre.
  - `checkListingShape` rechaza un pedido con la forma equivocada: sin operación en ML, con operación en Zonaprop, plan donde no hay planes o falta de plan donde se pide (`PlanRequired`).
- **Migración 0035, compatible hacia atrás**: suma `plan`, saca el CHECK que exigía operación en las publicaciones de propiedades y agrega un índice único parcial `(portal, property_id) where operation is null`. La versión anterior siempre escribe la operación.
- **Créditos antes de pedir.** `RequestPublication` y `ChangeListingPlan` leen los créditos de la cuenta con `PortalAccountDirectory` (fuera de la transacción): el plan tiene que ser de propiedades (`PlanNotOffered`) y tener créditos (`NoCreditsLeft`). Si Zonaprop igual responde `ERR-0502`, la sincronización falla con ese motivo.
- **Un conector por proveedor detrás de uno solo.** `PortalConnectorsByProvider` deriva cada pedido al conector de MercadoLibre o al de Zonaprop según el proveedor del portal; el core sigue recibiendo un `PortalConnector`.
- **`update` siempre recibe el contenido**, con `contentChanged` aparte. MercadoLibre solo lo manda si cambió; Zonaprop lo necesita para volver a poner online un aviso.
- **Zonaprop (infra):**
  - El código del aviso es el ID de la publicación sin guiones: no cambia aunque cambie el código de referencia de la propiedad. `claveReferencia` lleva el código de referencia.
  - Crear y modificar es un `PUT` del aviso completo. Pausar es `DELETE` (offline) y reactivar es otro `PUT`. Dar de baja también es `DELETE`; uno que Zonaprop no tiene cuenta como dado de baja.
  - La ubicación sale de las coordenadas (`/v1/ubicaciones/latitud/…/longitud/…`), la más precisa, con caché en memoria. Sin coordenadas no se publica.
  - Mapeo de tipos (`/v1/tipopropiedades`): departamento 2, casa 1, PH 2001, terreno 26, oficina 4, local 5, cochera 32, galpón 8 (Bodega-Galpón) y depósito 45.
  - Características principales `CFT*` (ambientes, dormitorios, baños, toilettes, antigüedad, expensas, cocheras, superficies) y orientación, disposición, apto crédito, amoblado y apto profesional por sus IDs.
  - `muestraMapa` es `EXACTO` con la dirección publicada y `APROXIMADO` sin ella.
  - Los rechazos llegan como `PortalRejected` con los mensajes de Zonaprop; `ERR-0502` se explica como "no quedan créditos de este plan".
- **Fotos**: el lector arma hasta 50 URLs firmadas; el conector de MercadoLibre sigue recortando a 30.

## Consecuencias

- La huella del contenido suma el plan. Como un campo sin valor no entra en la huella, las publicaciones de MercadoLibre no cambian de huella por este cambio. Las que tienen más de 30 fotos sí: el lector ahora trae hasta 50, y se vuelven a mandar una vez (ML se queda con las primeras 30).
- En el sandbox, poner el aviso offline libera su crédito y volver a publicarlo usa uno: el crédito se usa mientras el aviso está online. La pestaña Difusión lo explica.
- Una propiedad sin coordenadas no se publica en Zonaprop. Las propiedades se geolocalizan al guardar la dirección.
- No hay permalink del aviso: la API no lo devuelve. Queda para cuando se lea el aviso publicado.
