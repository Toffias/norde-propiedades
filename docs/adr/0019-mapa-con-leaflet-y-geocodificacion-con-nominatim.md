# ADR 0019: Mapa con Leaflet y OpenStreetMap, geocodificación con Nominatim

- **Estado**: aceptada
- **Fecha**: 2026-10-01

## Contexto

La etapa 2 de #5 suma la vista de mapa del buscador de propiedades y la geocodificación al dar de alta. `docs/modulos/03-sistema-gestion.md` §4.3 dejaba abierto el proveedor: Leaflet con OpenStreetMap (sin costo) o Google Maps (mejor geocodificación, con costo por uso a partir de una cuota mensual).

## Decisión

- **Mapa del panel con Leaflet** (`leaflet` y `leaflet.markercluster`) y las teselas públicas de OpenStreetMap, con la atribución que pide su licencia.
  - Una capa por estado, que se prende y se apaga. Los pines se agrupan (clustering) cuando están cerca.
  - El mapa pide los pines del **área visible** (`GetPropertyMap`, con los mismos filtros del buscador) y trae como mucho 500 (`MAX_MAP_PINS`). Si hay más, avisa que hay que acercarse.
  - El rectángulo se resuelve con el índice `properties_coordinates_idx` (latitud, longitud). Sin PostGIS: alcanza para el volumen de Norde.
- **Geocodificación con Nominatim** (OpenStreetMap), detrás del puerto `Geocoder` del módulo `properties` (`NominatimGeocoder` en `@norde/infra`).
  - Se usa solo al dar de alta una propiedad sin coordenadas: un pedido por alta, muy por debajo del límite de uso (un pedido por segundo).
  - Cada pedido va identificado con `GEOCODER_USER_AGENT` (la app y un contacto), como exige la política de uso. `GEOCODER_URL` permite usar otra instancia.
  - Si no encuentra la dirección o el servicio falla, la propiedad se crea igual, el alta avisa y las coordenadas se completan en la ficha. El resultado (`manual`, `found`, `not_found`, `failed`) vuelve en la salida del caso de uso.

## Consecuencias

- Sin costo ni API key para el panel.
- La calle y la altura (datos privados) salen hacia Nominatim al geocodificar. No se loguean.
- Las teselas públicas y la instancia pública de Nominatim son para uso moderado. Si el tráfico crece (por ejemplo, el mapa del sitio web), se cambia a un proveedor de teselas o a una instancia propia: es la URL de las teselas en el componente del mapa y `GEOCODER_URL`, sin tocar el core.
- Pasar a Google Maps (u otro geocodificador) es un adaptador nuevo del puerto `Geocoder` y una línea en `container.ts`.
