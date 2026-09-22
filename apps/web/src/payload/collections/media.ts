import type { CollectionConfig } from 'payload';

/**
 * Imágenes del contenido editorial (blog, páginas).
 * Las fotos de propiedades NO van acá: las gestiona el sistema de gestión.
 * Por ahora se guardan en disco; se pasa a S3/R2 (`@payloadcms/storage-s3`) antes de producción.
 */
export const Media: CollectionConfig = {
  slug: 'media',
  labels: { singular: 'Imagen', plural: 'Imágenes' },
  access: { read: () => true },
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
