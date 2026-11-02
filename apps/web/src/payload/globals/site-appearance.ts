import type { GlobalConfig } from 'payload';

import { LOGO_HEIGHT_LIMITS } from '../../lib/brand/logo-size';
import { anyone, authenticated } from '../access';
import { revalidateGlobal } from '../hooks/revalidate-blog';

/**
 * Ajustes visuales del sitio que Norde puede cambiar sin un deploy. Por ahora, el alto del logo
 * de Mi empresa: cada imagen tiene más o menos aire alrededor y el mismo alto no le queda bien a
 * todas.
 */
export const SiteAppearance: GlobalConfig<'site-appearance'> = {
  slug: 'site-appearance',
  label: 'Apariencia',
  access: { read: anyone, update: authenticated },
  admin: { group: 'Sitio' },
  fields: [
    {
      type: 'row',
      fields: [
        {
          name: 'headerLogoHeight',
          label: 'Alto del logo en el encabezado (px)',
          type: 'number',
          min: LOGO_HEIGHT_LIMITS.header.min,
          max: LOGO_HEIGHT_LIMITS.header.max,
          admin: {
            step: 1,
            placeholder: String(LOGO_HEIGHT_LIMITS.header.default),
            description: `En computadora, de ${LOGO_HEIGHT_LIMITS.header.min} a ${LOGO_HEIGHT_LIMITS.header.max}. En el celular se achica en proporción. Vacío: ${LOGO_HEIGHT_LIMITS.header.default}.`,
          },
        },
        {
          name: 'footerLogoHeight',
          label: 'Alto del logo en el pie (px)',
          type: 'number',
          min: LOGO_HEIGHT_LIMITS.footer.min,
          max: LOGO_HEIGHT_LIMITS.footer.max,
          admin: {
            step: 1,
            placeholder: String(LOGO_HEIGHT_LIMITS.footer.default),
            description: `De ${LOGO_HEIGHT_LIMITS.footer.min} a ${LOGO_HEIGHT_LIMITS.footer.max}. Vacío: ${LOGO_HEIGHT_LIMITS.footer.default}.`,
          },
        },
      ],
    },
  ],
  hooks: { afterChange: [revalidateGlobal] },
};
