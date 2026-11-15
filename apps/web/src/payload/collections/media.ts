import type { CollectionConfig } from 'payload';

import { authenticated, authenticatedOrSite } from '../access';

/**
 * Imágenes del contenido editorial (blog, páginas).
 * Las fotos de propiedades NO van acá: las gestiona el sistema de gestión.
 * Por ahora se guardan en disco; se pasa a S3/R2 (`@payloadcms/storage-s3`) antes de producción.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Imagen', plural: 'Imágenes' },
  // Los archivos se sirven a todos; el listado de la API REST (con las imágenes de los borradores),
  // solo a los editores.
  access: {
    read: authenticatedOrSite,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*'],
    focalPoint: true,
    imageSizes: [
      { name: 'thumbnail', width: 300 },
      { name: 'card', width: 768 },
      { name: 'hero', width: 1920 },
      { name: 'og', width: 1200, height: 630, position: 'centre' },
    ],
  },
  fields: [
    {
      name: 'alt',
      label: 'Texto alternativo',
      type: 'text',
      required: true,
      admin: { description: 'Describí la imagen (accesibilidad y SEO).' },
    },
  ],
};
