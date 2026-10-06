import { getContainer } from '../../../../../container';
import { photoResponse } from '../../../../../lib/properties/photo-response';

// Fotos públicas de las propiedades (ADR 0023): la versión web del bucket privado, solo de lo
// publicado. La URL cambia con la foto, así que el navegador y el CDN la cachean para siempre.

export async function GET(
  _request: Request,
  context: RouteContext<'/fotos/[id]/[version]'>,
): Promise<Response> {
  const { id, version } = await context.params;
  return photoResponse(await getContainer().properties.photo({ mediaId: id, version }));
}
