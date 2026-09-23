import type { CollectionConfig } from 'payload';

import { authenticated } from '../access';
import { revalidateOnChange } from '../hooks/revalidate-blog';

/**
 * Editores del sitio (admin de Payload). No son los usuarios del panel de gestión.
 * También son los autores del blog: el sitio lee solo nombre, cargo, bio y foto (nunca el email).
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  auth: true,
  access: {
    read: authenticated,
    create: authenticated,
    update: authenticated,
    delete: authenticated,
  },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'email', 'role'] },
  fields: [
    { name: 'name', label: 'Nombre', type: 'text', required: true },
    {
      name: 'role',
      label: 'Cargo',
      type: 'text',
      admin: {
        description:
          'Ej.: "Corredora inmobiliaria matriculada". Se muestra junto al nombre en sus artículos.',
      },
    },
    {
      name: 'bio',
      label: 'Bio',
      type: 'textarea',
      admin: {
        description:
          'Se muestra como autor en el blog y en los datos estructurados (señal E-E-A-T para buscadores).',
      },
    },
    {
      name: 'photo',
      label: 'Foto',
      type: 'upload',
      relationTo: 'media',
    },
  ],
  hooks: { afterChange: [revalidateOnChange] },
};
