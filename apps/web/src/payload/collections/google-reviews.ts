import type { CollectionConfig } from 'payload';

import { anyone, authenticated } from '../access';
import { validateHttpsUrl } from '../fields/validate-https-url';
import { revalidateOnChange, revalidateOnDelete } from '../hooks/revalidate-blog';

/**
 * Reseñas de Google elegidas para mostrar en "Nosotros". Se cargan a mano, copiadas de la ficha
 * de Google de Norde: el sitio no lee la API de Google. Son contenido editorial y públicos
 * (el nombre y la foto son los que el autor ya publicó en Google).
 */
export const GoogleReviews: CollectionConfig<'google-reviews'> = {
  slug: 'google-reviews',
  labels: { singular: 'Reseña de Google', plural: 'Reseñas de Google' },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  admin: {
    group: 'Nosotros',
    useAsTitle: 'authorName',
    defaultColumns: ['authorName', 'rating', 'reviewedAt', 'order', 'active'],
    description:
      'Copiá las reseñas de la ficha de Google de Norde que quieras mostrar en el sitio.',
  },
  defaultSort: 'order',
  fields: [
    { name: 'authorName', label: 'Nombre del autor', type: 'text', required: true },
    {
      name: 'authorPhoto',
      label: 'Foto del autor',
      type: 'upload',
      relationTo: 'media',
      admin: {
        description: 'Cuadrada. Sin foto, se muestra la inicial del nombre, como en Google.',
      },
    },
    {
      name: 'authorDetail',
      label: 'Detalle del autor',
      type: 'text',
      admin: { description: 'Opcional. Ej.: "Local Guide · 45 reseñas".' },
    },
    {
      name: 'rating',
      label: 'Estrellas',
      type: 'number',
      required: true,
      defaultValue: 5,
      min: 1,
      max: 5,
      admin: { step: 1 },
    },
    {
      name: 'text',
      label: 'Texto de la reseña',
      type: 'textarea',
      required: true,
    },
    {
      name: 'reviewedAt',
      label: 'Fecha de la reseña',
      type: 'date',
      required: true,
      admin: {
        date: { pickerAppearance: 'dayOnly', displayFormat: 'dd/MM/yyyy' },
        description: 'Se muestra como en Google: "hace 3 meses".',
      },
    },
    {
      name: 'reviewUrl',
      label: 'Link a la reseña',
      type: 'text',
      validate: validateHttpsUrl,
      admin: { description: 'Opcional. El link a la reseña en Google Maps ("Compartir reseña").' },
    },
    {
      name: 'order',
      label: 'Orden',
      type: 'number',
      defaultValue: 0,
      index: true,
      admin: { position: 'sidebar', description: 'Menor número, más arriba.' },
    },
    {
      name: 'active',
      label: 'Mostrar en el sitio',
      type: 'checkbox',
      defaultValue: true,
      index: true,
      admin: { position: 'sidebar' },
    },
  ],
  hooks: {
    afterChange: [revalidateOnChange],
    afterDelete: [revalidateOnDelete],
  },
};
