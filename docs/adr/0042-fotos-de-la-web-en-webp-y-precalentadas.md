# ADR 0042: Fotos de la web en WebP y precalentadas

- **Estado**: aceptada
- **Fecha**: 2026-10-23
- **Complementa**: ADR 0023 (fotos públicas y revalidación de la web).

## Contexto

Las fotos del sitio tardaban en aparecer. Se midió en UAT el 2026-10-23, pidiendo a `/_next/image` fotos de `/fotos/<id>/<versión>` (variante web de 1600 px, unos 190 KB):

| Pedido                          | Primera vez (sin caché) | Desde la caché |
| ------------------------------- | ----------------------- | -------------- |
| AVIF (lo que pide un navegador) | 0,9 a 2,5 s             | 0,18 s         |
| WebP                            | 0,6 a 0,9 s             | 0,18 s         |

Dos cosas lo empeoraban:

- **AVIF.** El optimizador convierte a AVIF si el navegador lo acepta (todos los actuales). Pesa ~40 % menos que WebP, pero tarda 2 a 3 veces más en convertirse en el VPS compartido.
- **La caché casi nunca estaba caliente.** Cada combinación de foto, ancho y formato es una conversión aparte, y con los 8 anchos por defecto de Next.js más 8 chicos, la primera visita a cada foto casi siempre pagaba la conversión.

## Decisión

- **Solo WebP** (`images.formats`). Unos KB más por foto a cambio de convertir 2 a 3 veces más rápido.
- **Menos anchos**: 640, 828, 1080, 1280, 1600 y 1920 para fotos grandes, y 96, 256 y 384 para las chicas (`src/lib/images/sizes.ts`). Las fotos de propiedades llegan de 1600 px, así que más anchos no suman nitidez.
- **Precalentado al cambiar una propiedad.** Cuando `POST /api/revalidate` recibe un `propertyId`, después de invalidar los tags encola la propiedad en un `ImageWarmer` del proceso:
  - Lee sus fotos y planos publicados con `GetPropertyDetail` y pide cada uno a `/_next/image` en WebP, en los anchos de 384 px en adelante.
  - Una propiedad y una foto a la vez, para no competir con las visitas por el CPU. Si la misma propiedad se avisa varias veces mientras espera, se calienta una sola vez.
  - Las fotos importadas sin archivo propio (`https://`) no pasan por el optimizador y se saltean.
  - Un fallo se loguea y sigue con la próxima: es una optimización, no puede romper la revalidación.
- **El visor de la ficha baja la foto anterior y la siguiente** mientras se mira la actual.

## Consecuencias

- La primera visita a una foto que se cargó o cambió después de este cambio la encuentra convertida: responde en ~0,2 s.
- Las fotos que ya estaban publicadas se calientan cuando su propiedad vuelve a cambiar, o con la primera visita.
- La caché de `/_next/image` vive en `apps/web/.next/cache/images` y el deploy no la borra (ver `docs/deploy.md`).
- Los emprendimientos no se precalientan todavía: su ficha se busca por slug y el aviso trae el ID.
- Si el tráfico lo pidiera, un CDN o la caché de Nginx delante de `/_next/image` y `/fotos/*` sigue siendo posible sin cambiar código.
