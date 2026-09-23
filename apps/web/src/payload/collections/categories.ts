import type { CollectionConfig } from 'payload';

import { anyone, authenticated } from '../access';
import { spanishSlugField } from '../fields/spanish-slug-field';
import { revalidateOnChange, revalidateOnDelete } from '../hooks/revalidate-blog';

/** Categorías del blog. Cada una tiene su página en `/blog/categoria/<slug>`. */
export const Categories: CollectionConfig<'categories'> = {
  slug: 'categories',
  labels: { singular: 'Categoría', plural: 'Categorías' },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  admin: {
    group: 'Blog',
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'updatedAt'],
  },
  defaultPopulate: { title: true, slug: true },
  fields: [
    { name: 'title', label: 'Nombre', type: 'text', required: true },
    {
      name: 'description',
      label: 'Descripción',
      type: 'textarea',
      maxLength: 300,
      admin: {
        description:
          'Se muestra como introducción de la categoría y como meta description (ideal: 120 a 160 caracteres).',
      },
    },
    spanishSlugField(),
  ],
  hooks: {
    afterChange: [revalidateOnChange],
    afterDelete: [revalidateOnDelete],
  },
};
