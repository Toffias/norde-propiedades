import type { CollectionConfig } from 'payload';

/** Editores del sitio (admin de Payload). No son los usuarios del panel de gestión. */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  auth: true,
  admin: { useAsTitle: 'email', defaultColumns: ['name', 'email'] },
  fields: [
    { name: 'name', label: 'Nombre', type: 'text', required: true },
    {
      name: 'bio',
      label: 'Bio',
      type: 'textarea',
      admin: { description: 'Se muestra como autor en el blog (señal E-E-A-T para buscadores).' },
    },
  ],
};
