# ADR 0052: El mapa de los PDF se arma con teselas de OpenStreetMap

- **Estado**: aceptada
- **Fecha**: 2026-10-29

## Contexto

Dos formatos de la ficha en PDF (#175), "Horizontal con mapa" y "Vertical con mapa", llevan un mapa con la ubicación. Tokko usa un mapa estático de Google, con comercios de terceros.

El panel ya usa las teselas públicas de OpenStreetMap con Leaflet (ADR 0019). Esa política de uso pide moderación y un User-Agent que identifique la app. Norde decidió el 2026-10-29 que el mapa muestre la ubicación exacta, como en Tokko.

## Decisión

- **Puerto `StaticMaps`** en el módulo `properties`. Devuelve una imagen apaisada (2:1) centrada en las coordenadas. El caso de uso la pide solo en los formatos con mapa y si la propiedad tiene coordenadas.
- **`OsmStaticMaps`** en infra:
  - Arma la imagen de 1024 × 512 a zoom 16 con las teselas de OpenStreetMap y la ubicación exacta.
  - Suma el marcador rojo de la marca y la atribución "© OpenStreetMap".
- **Moderación con las teselas públicas**:
  - Se piden de a 4, con timeout de 5 segundos y el mismo `GEOCODER_USER_AGENT` de Nominatim.
  - Se guardan en memoria las últimas 400: las propiedades de un mismo barrio comparten las suyas.
- **`MAP_TILES_URL`** cambia el proveedor (`{z}/{x}/{y}`) sin tocar el código, si el volumen crece.
- **Si una tesela falla, no hay mapa** y el PDF sale con una foto en su lugar. Un mapa nunca hace fallar el PDF.

## Consecuencias

- Una selección de 100 propiedades con mapa pide unas 15 teselas por propiedad que no estén en la caché. Para el volumen de Norde (unas pocas personas, de vez en cuando) entra en el uso moderado. Si se exporta seguido en cantidad, conviene un proveedor con clave.
- Las teselas de OpenStreetMap muestran algunos íconos de comercios a ese zoom. Un estilo sin comercios (otro proveedor) es solo cambiar `MAP_TILES_URL`.
