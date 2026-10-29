import { getCompanyLogo } from '../../../../lib/brand/company-logo';

// El logo que Norde cargó en el panel (Mi empresa), para el header y el footer. La URL lleva la
// versión de la imagen: con otro logo cambia la URL, así que se cachea para siempre.

export async function GET(
  _request: Request,
  context: RouteContext<'/logo/[version]'>,
): Promise<Response> {
  const { version } = await context.params;
  const logo = await getCompanyLogo();
  if (logo === null) return new Response(null, { status: 404 });
  // Una versión vieja sigue respondiendo con el logo actual, pero sin caché larga.
  const current = logo.version === version;
  return new Response(Buffer.from(logo.base64, 'base64'), {
    headers: {
      'Content-Type': logo.contentType,
      'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
