import type { GetPublicPhotoError, PublicPhotoDelivery } from '@norde/core/properties';
import type { Result } from '@norde/core/shared';

/** La URL lleva la versión de la foto: si cambia, cambia la URL. Se cachea para siempre. */
const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Una URL vieja o un link externo pueden cambiar de destino: un día. */
const ONE_DAY = 'public, max-age=86400';
/** Una foto oculta puede volver a publicarse: poco tiempo. */
const ONE_MINUTE = 'public, max-age=60';

/** La respuesta de `/fotos/<id>/<versión>` según lo que entregó `GetPublicPhoto`. */
export function photoResponse(result: Result<PublicPhotoDelivery, GetPublicPhotoError>): Response {
  if (result.isErr()) {
    // `Forbidden` es un error de configuración del actor de la web, no del pedido.
    if (result.error.type === 'Forbidden') throw new Error('The web actor cannot read properties');
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': ONE_MINUTE } });
  }
  const delivery = result.value;
  switch (delivery.kind) {
    case 'content':
      return new Response(new Uint8Array(delivery.bytes), {
        headers: {
          'Content-Type': delivery.contentType,
          'Content-Length': String(delivery.bytes.byteLength),
          'Cache-Control': IMMUTABLE,
        },
      });
    case 'moved':
      return new Response(null, {
        status: 308,
        headers: { Location: delivery.path, 'Cache-Control': ONE_DAY },
      });
    case 'external':
      return new Response(null, {
        status: 307,
        headers: { Location: delivery.url, 'Cache-Control': ONE_DAY },
      });
  }
}
