# ADR 0023: Fotos públicas y revalidación de la web

- **Estado**: aceptada
- **Fecha**: 2026-10-05
- **Complementa**: ADR 0011 (render on-demand), ADR 0018 (storage S3/R2), ADR 0020 (variantes de fotos en jobs) y ADR 0021 (jobs en `apps/gestion`).

## Contexto

`apps/web` muestra las propiedades publicadas leyendo la base con los casos de uso de `@norde/core` (`SearchProperties`, `GetPropertyDetail`). Le faltaban dos piezas para armar el listado y la ficha:

- **Las fotos.** Viven en un bucket privado (ADR 0018) y el panel las entrega con URLs firmadas de 5 minutos. Una URL firmada no sirve para una página cacheada ni para buscadores: vence, cambia en cada pedido y deja ver la original sin marca de agua.
- **Saber cuándo algo cambió.** Las páginas se cachean (ADR 0011). Si el equipo baja un precio, oculta una foto o reserva la propiedad, la web tiene que enterarse sin esperar una hora.

El usuario lo pidió así: el bucket lo leen **solo** gestión y la web. Gestión ve todo; la web, solo lo publicado.

## Decisión

### Fotos

- **Las dos apps leen el mismo bucket privado con credenciales propias.** La web usa una clave de **solo lectura** (`STORAGE_DRIVER` y `S3_*` en su `.env`). En desarrollo, `local` lee la carpeta del panel (`../gestion/.storage`).
- **La web sirve las fotos desde su propio dominio**, en `/fotos/<id>/<versión>`, con el caso de uso `GetPublicPhoto` (`system:web`, `properties:read`):
  - Solo fotos y planos de una propiedad **publicada** (`isPubliclyListed`), marcados "Mostrar en la web" y con su variante lista (`isPublicImage`).
  - Entrega la variante con marca de agua o, si no hay, la web (`publicImageKey`). **Nunca la original.**
  - Lo demás responde 404, sin distinguir "no existe" de "no se publica".
- **La versión es la última modificación de la foto** (`publicImageVersion`). Si la foto cambia (rotación, variantes nuevas), cambia la URL. Por eso la respuesta se cachea para siempre (`Cache-Control: public, max-age=31536000, immutable`).
  - Una versión vieja responde 308 a la URL actual.
  - Una foto importada sin archivo propio responde 307 a su link `https://`.
- **Los bytes pasan por la web, sin URL firmada.** El navegador, el optimizador de `next/image` y un CDN cachean la URL estable; el bucket sigue privado.
- **Los emprendimientos** tendrán su propia regla de publicación cuando lleguen sus páginas (etapa 3). Hasta entonces, sus fotos no se sirven.

### Revalidación

- **Dos eventos de dominio nuevos, emitidos desde el aggregate**, para que ninguna edición se olvide de avisar:
  - `properties.property_changed` (`Property`).
  - `properties.media_changed` (`MediaItem`).
  - `pullEvents()` los agrega si el estado cambió desde que se cargó o se guardó por última vez. Cada mutación reemplaza el estado interno, así que el chequeo es por referencia, no por fecha.
  - Se emiten **uno por guardado**, sin importar cuántos campos cambiaron, y también en el alta.
  - Los commands de la galería que guardaban sin publicar eventos (link, orden, portada, variantes) ahora los publican.
- **Un job en `apps/gestion`** (`revalidate-site`) escucha `property_changed`, `media_changed` y `media_deleted`, y llama `RevalidatePublicProperty` (`system:scheduler`, `properties:revalidate-site`).
- **El puerto `PublicSite`** lo implementa `WebhookPublicSite` en `@norde/infra`:
  - Hace `POST <WEB_REVALIDATE_URL>` con `{ "propertyId": "…" }`.
  - Lo firma con `x-norde-signature: sha256=<HMAC-SHA256 del body>`, el mismo esquema que el webhook de consultas.
  - Si la web responde con error, lanza y pg-boss reintenta con backoff.
  - Sin URL ni secreto configurados (desarrollo), `LogPublicSite` deja constancia en el log.
- **`POST /api/revalidate` en la web**:
  - Verifica la firma con `REVALIDATE_SECRET` sobre el body crudo, de hasta 1 KB, y valida el ID con Zod.
  - Invalida los tags `property:<id>` y `properties` con `revalidateTag(tag, { expire: 0 })`.
  - Sin secreto configurado, no se expone (404).
- **Respaldo por tiempo**: las consultas cacheadas de propiedades expiran cada hora (`PROPERTIES_REVALIDATE_SECONDS`), por si se pierde un aviso.

## Consecuencias

- Un cambio en el panel se ve en la web en segundos: lo que tarda el relay del outbox y un POST.
- Reordenar la galería emite un `media_changed` por foto movida, y cada uno es una revalidación. Es barato (invalida tags) y no hace falta agrupar.
- Despublicar una propiedad no borra las copias de sus fotos que ya cachearon navegadores o un CDN. Las fotos ya eran públicas; la ficha y los listados sí se actualizan.
- Las fotos pasan por el proceso de la web. Si el tráfico lo pidiera, se pone un CDN delante de `/fotos/*`. No hace falta cambiar código: las URLs ya son inmutables.
- Hay dos secretos nuevos que tienen que coincidir: `WEB_REVALIDATE_SECRET` (gestión) y `REVALIDATE_SECRET` (web).
- La clave del bucket de la web es de solo lectura. Si se filtra, expone lo que hay en el bucket, incluidas las originales: hay que rotarla como cualquier secreto.
