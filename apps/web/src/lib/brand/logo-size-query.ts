import 'server-only';

import config from '@payload-config';
import { unstable_cache } from 'next/cache';
import { getPayload } from 'payload';

import { getLogger } from '../../config/logger';
import { BLOG_CACHE_TAG, BLOG_REVALIDATE_SECONDS } from '../blog/cache';
import { toLogoSizes, type LogoSizes } from './logo-size';

/**
 * El alto del logo elegido en "Apariencia", cacheado con el tag del contenido editorial (lo
 * invalida el hook del global). Si la lectura falla (por ejemplo, en el build, que corre sin
 * base), se loguea y se usan los altos por defecto: el header no puede romperse por esto.
 */
export const getLogoSizes = unstable_cache(
  async (): Promise<LogoSizes> => {
    try {
      const payload = await getPayload({ config });
      const settings = await payload.findGlobal({
        slug: 'site-appearance',
        depth: 0,
        overrideAccess: false,
      });
      return toLogoSizes(settings);
    } catch (error) {
      getLogger()
        .child({ component: 'logo-size' })
        .error({ err: error }, 'Logo sizes could not be read');
      return toLogoSizes(null);
    }
  },
  ['brand:logo-sizes'],
  { tags: [BLOG_CACHE_TAG], revalidate: BLOG_REVALIDATE_SECONDS },
);
