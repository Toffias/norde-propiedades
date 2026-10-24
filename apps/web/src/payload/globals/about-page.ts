import type { GlobalConfig } from 'payload';

import { anyone, authenticated } from '../access';
import { revalidateGlobal } from '../hooks/revalidate-blog';

/** Máximos que la página puede mostrar sin romper el diseño. */
export const ABOUT_MAX_MILESTONES = 8;
export const ABOUT_MAX_STATS = 4;

/**
 * Textos de "Nosotros" en la página de contacto: la presentación, los hitos de la historia y
 * las cifras. Una sección sin datos no se muestra.
 */
export const AboutPage: GlobalConfig<'about-page'> = {
  slug: 'about-page',
  label: 'Nosotros',
  access: { read: anyone, update: authenticated },
  admin: { group: 'Nosotros' },
  fields: [
    {
      name: 'intro',
      label: 'Presentación',
      type: 'textarea',
      maxLength: 280,
      admin: { description: 'Uno o dos renglones debajo de "Somos Norde", sobre la foto.' },
    },
    {
      name: 'milestones',
      label: 'Historia',
      labels: { singular: 'Hito', plural: 'Hitos' },
      type: 'array',
      maxRows: ABOUT_MAX_MILESTONES,
      admin: { description: 'Los hitos en orden, del más viejo al de hoy.' },
      fields: [
        {
          name: 'label',
          label: 'Cuándo',
          type: 'text',
          required: true,
          admin: { description: 'Un año o una etapa. Ej.: "2012", "Los comienzos", "Hoy".' },
        },
        { name: 'title', label: 'Título', type: 'text', required: true },
        { name: 'text', label: 'Texto', type: 'textarea', required: true, maxLength: 400 },
        {
          name: 'image',
          label: 'Foto',
          type: 'upload',
          relationTo: 'media',
          admin: { description: 'Opcional. Sin foto, se usa un recorte de la fachada.' },
        },
      ],
    },
    {
      name: 'stats',
      label: 'Cifras',
      labels: { singular: 'Cifra', plural: 'Cifras' },
      type: 'array',
      maxRows: ABOUT_MAX_STATS,
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'prefix', label: 'Antes', type: 'text', admin: { description: 'Ej.: "+"' } },
            { name: 'value', label: 'Número', type: 'number', required: true, min: 0 },
            { name: 'suffix', label: 'Después', type: 'text', admin: { description: 'Ej.: "%"' } },
          ],
        },
        {
          name: 'label',
          label: 'Qué cuenta',
          type: 'text',
          required: true,
          admin: { description: 'Ej.: "años en el barrio".' },
        },
      ],
    },
  ],
  hooks: { afterChange: [revalidateGlobal] },
};
