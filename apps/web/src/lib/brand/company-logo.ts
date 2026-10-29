import 'server-only';

import { createHash } from 'node:crypto';

import { unstable_cache } from 'next/cache';

import { getLogger } from '../../config/logger';
import { getContainer } from '../../container';

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
 * El logo que Norde cargó en el panel, o `null` si no cargó ninguno. Si la lectura falla (por
 * ejemplo, en el build, que corre sin base), se loguea y la web usa el logo dibujado con texto.
 */
export const getCompanyLogo = unstable_cache(
  async (): Promise<CompanyLogo | null> => {
    try {
      const result = await getContainer().companyLogo();
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
        .error({ err: error }, 'Company logo could not be read');
      return null;
    }
  },
  ['brand:company-logo'],
  { tags: ['company-logo'], revalidate: REVALIDATE_SECONDS },
);
