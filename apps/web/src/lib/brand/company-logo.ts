import 'server-only';

import { createHash } from 'node:crypto';

import { unstable_cache } from 'next/cache';

import { getLogger } from '../../config/logger';
import { getContainer, type CompanyLogoVariant } from '../../container';

/** El logo de Mi empresa listo para servir: los bytes van en base64 porque el caché guarda JSON. */
export interface CompanyLogo {
  readonly contentType: string;
  readonly base64: string;
  /** Cambia con la imagen: va en la URL para que el navegador no muestre la anterior. */
  readonly version: string;
}

/** El panel no avisa cuando cambia el logo: se vuelve a leer, como mucho, cada una hora. */
const REVALIDATE_SECONDS = 3600;

/**
 * Un logo que Norde cargó en el panel (el común o el de fondos oscuros), o `null` si no cargó ese.
 * Si la lectura falla (por ejemplo, en el build, que corre sin base), se loguea y la web usa el
 * logo dibujado con texto.
 */
export const getCompanyLogo = unstable_cache(
  async (variant: CompanyLogoVariant): Promise<CompanyLogo | null> => {
    try {
      const result = await getContainer().companyLogo(variant);
      if (result.isErr()) return null;
      const bytes = Buffer.from(result.value.bytes);
      return {
        contentType: result.value.contentType,
        base64: bytes.toString('base64'),
        version: createHash('sha256').update(bytes).digest('hex').slice(0, 12),
      };
    } catch (error) {
      getLogger()
        .child({ component: 'company-logo' })
        .error({ err: error, variant }, 'Company logo could not be read');
      return null;
    }
  },
  ['brand:company-logo'],
  { tags: ['company-logo'], revalidate: REVALIDATE_SECONDS },
);

/**
 * La respuesta de `/logo/...`: la URL lleva la versión de la imagen, así que con otro logo cambia
 * la URL y se cachea para siempre. Una versión vieja sigue respondiendo con el logo actual, pero
 * sin caché larga.
 */
export async function companyLogoResponse(
  variant: CompanyLogoVariant,
  version: string,
): Promise<Response> {
  const logo = await getCompanyLogo(variant);
  if (logo === null) return new Response(null, { status: 404 });
  const current = logo.version === version;
  return new Response(Buffer.from(logo.base64, 'base64'), {
    headers: {
      'Content-Type': logo.contentType,
      'Cache-Control': current ? 'public, max-age=31536000, immutable' : 'public, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
