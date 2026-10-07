# ADR 0024: Publicación de propiedades en MercadoLibre

- **Estado**: aceptada
- **Fecha**: 2026-10-06
- **Complementa**: ADR 0022 (cuentas de MercadoLibre por OAuth), ADR 0021 (jobs en `apps/gestion`) y ADR 0023 (fotos públicas).

## Contexto

La etapa 2 de #14 publica las propiedades del panel en MercadoLibre: el equipo publica desde la ficha y, de ahí en más, los cambios de la propiedad llegan solos al aviso. La API de inmuebles de ML impone algunas condiciones:

- **Un aviso por operación.** Cada operación es una categoría distinta (Departamentos > Venta > Propiedades individuales, Departamentos > Alquiler…). Una propiedad en venta y en alquiler son dos avisos.
- **Cerrar es definitivo.** Un aviso pausado se reactiva; uno cerrado no. Volver a mostrarlo es un aviso nuevo, sin su antigüedad ni sus visitas.
- **Datos obligatorios por categoría** (superficies, ambientes, dormitorios, baños, cocheras), al menos una foto y, desde el 01/10/2026, el WhatsApp del vendedor en cada alta y edición.
- **Las fotos se mandan por URL** y ML las descarga al recibir el aviso. El bucket es privado, y la web solo sirve fotos de propiedades publicadas en la web (ADR 0023), que no son todas las que van a ML.
- **La ubicación va por IDs** del árbol de ML (estado → ciudad → barrio). No hay búsqueda por nombre, y Buenos Aires está partida en regiones comerciales (GBA Norte, Oeste, Sur…).
- **El refresh token es de un solo uso** (ADR 0022): dos procesos que renuevan a la vez dejan la cuenta sin credenciales.

## Decisión

### Modelo

- **`Listing`** (módulo `portals`) es una publicación por portal, propiedad y operación, con:
  - `intent`: lo que se pidió (activo, pausado o cerrado).
  - `status`: cómo quedó en el portal (pendiente, publicada, pausada, con error o dada de baja).
- **`plan()`** decide qué hacer combinando lo pedido con el estado de la propiedad:
  - Disponible → activo.
  - Reservada o pausada → pausa el aviso.
  - Vendida, alquilada, retirada, borrador o en la papelera → lo cierra.
  - Cerrar deja la intención en "cerrado": aunque la propiedad vuelva a estar disponible, republicar es una decisión del equipo, porque consume cupo del paquete.
- **El contenido no se reenvía si no cambió.** La publicación guarda una huella (FNV-1a de 64 bits) de lo que se mandó. Las URLs firmadas quedan afuera de la huella: cuenta la versión de cada foto.
- **Migración `0034`**: suma `operation`, `intent`, `permalink` y `content_hash` a `portal_listings`. El índice único pasa a ser (portal, propiedad, operación). La tabla estaba vacía: hasta acá ningún código escribía publicaciones.

### Sincronización

- **Publicar es un command** (`RequestPublication`). Antes de pedir el job revisa:
  - Que la cuenta esté conectada y activa.
  - Que la propiedad esté disponible y no sea una unidad (las unidades van con su emprendimiento, etapa 4).
  - Que la operación tenga precio (sin precio o con "a consultar", no se publica).
  - Que tenga lo que exige ML (`PortalConnector.problems`).
- **El job `SyncListing`** (`system:portal-sync`, en `apps/gestion`) lleva la publicación al portal **con la fila bloqueada** (`select … for update`) mientras dura. Así dos sincronizaciones de la misma publicación no crean dos avisos.
- **Cómo termina el job:**
  - Si el portal rechaza el aviso, el motivo queda en la publicación (`lastError`), se audita y se emite `portals.listing_sync_failed`.
  - Si el portal no responde, también queda el motivo, y el job lanza para que pg-boss reintente con backoff.
- **Reacciones:**
  - `properties.property_changed`, `properties.media_changed` y `properties.media_deleted` piden sincronizar las publicaciones vivas de la propiedad (`RequestListingSync`).
  - Una edición interna (etiquetas, datos privados) no llega al portal, porque la huella no cambia.
- **Lo que arma el aviso** (`ListingSourceReader`) vive en el panel, porque compone módulos:
  - La ficha (`GetPanelPropertyDetail`).
  - Las fotos (`ListShareablePhotos`, nueva en `properties`).
  - La sucursal del captador (`GetBranch`, que aporta el contacto y el WhatsApp).
  - Mi empresa (el pie de la descripción para portales).

### MercadoLibre

- **Fotos por URL firmada de 24 horas.** Son las mismas que publica la web: marcadas "Mostrar en la web", con su versión lista y con marca de agua si está activa. Nunca la original. Como mucho 30 y la portada primero. Con el storage local no hay firma, así que no se puede publicar en desarrollo sin S3.
- **Categoría:** la hoja de "Propiedades individuales" por tipo y operación, con una tabla fija relevada de la API pública. El alquiler temporario todavía no se publica, porque ML pide huéspedes, horarios y estadía mínima, que no cargamos.
- **Atributos:**
  - Se mandan los obligatorios de cada categoría y los opcionales que tenemos (antigüedad, expensas, orientación, disposición, amoblado, apto crédito, código).
  - Las cocheras vacías van como 0.
  - El acceso de los terrenos va como "Otro" (decisiones de Norde).
- **Ubicación:**
  - Se recorre el árbol público de ML comparando los nombres de nuestro catálogo, sin acentos ni puntuación. CABA va a Capital Federal y la provincia de Buenos Aires se busca en todas sus regiones.
  - Si no encuentra el barrio, publica con la ciudad. Si no encuentra la ciudad, el aviso queda con error y dice qué lugar no encontró.
  - El árbol se guarda un día en memoria.
- **Contacto:** el de la sucursal del captador, con su WhatsApp como `phone2`.
- **Tipo de aviso:** simple = `silver` y destacado = `gold_premium`.
- **Tokens:** `MercadoLibreTokens` lee las credenciales con la fila de la cuenta bloqueada y renueva el access token si vence en menos de 5 minutos. Si ML rechaza el refresh, la publicación pide volver a conectar la cuenta.

## Consecuencias

- Una propiedad publicada se actualiza en ML segundos después de cada cambio: lo que tardan el relay del outbox y el job. Reordenar la galería dispara varias sincronizaciones, pero solo la primera llama a ML.
- Si el job se cae entre el alta en ML y el guardado de la publicación, el reintento crearía otro aviso. Es poco probable: el alta y el guardado van seguidos. Si pasa, se ve en la cuenta de ML y se cierra a mano.
- El pie de la descripción puede llevar teléfono y WhatsApp. ML modera los datos de contacto en la descripción, así que conviene un pie sin teléfonos para los portales.
- Pendiente para la etapa 2b:
  - Un job diario que concilie los avisos que ML venció o pausó por moderación.
  - El cupo de los paquetes en Mi empresa.
