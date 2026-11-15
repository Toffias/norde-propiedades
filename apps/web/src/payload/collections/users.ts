import { APIError, type CollectionBeforeChangeHook, type CollectionConfig } from 'payload';

import { getEnv } from '../../config/env';
import { admins, adminsOrSelf, authenticated, isAdmin } from '../access';
import { revalidateOnChange } from '../hooks/revalidate-blog';

/**
 * Sin sesión, solo se crea un editor por la Local API (scripts) o, con `PAYLOAD_FIRST_REGISTER`,
 * el primero desde `/admin`. El alta del primer usuario de Payload no pasa por `access.create`.
 */
const closeAnonymousRegister: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  if (operation !== 'create' || req.user || req.payloadAPI === 'local') return data;
  if (!getEnv().PAYLOAD_FIRST_REGISTER) {
    throw new APIError('El alta del primer usuario está cerrada.', 403, undefined, true);
  }
  return data;
};

/**
 * Editores del sitio (admin de Payload). No son los usuarios del panel de gestión.
 * También son los autores del blog: el sitio lee solo nombre, cargo, bio y foto (nunca el email).
 * Solo un administrador crea, borra o hace administrador a otro editor; cada uno edita su usuario.
 */
export const Users: CollectionConfig = {
  slug: 'users',
  labels: { singular: 'Usuario', plural: 'Usuarios' },
  auth: {
    cookies: { secure: getEnv().NODE_ENV === 'production', sameSite: 'Lax' },
  },
  access: {
    read: authenticated,
    create: admins,
    update: adminsOrSelf,
    delete: admins,
  },
  admin: { useAsTitle: 'name', defaultColumns: ['name', 'email', 'role', 'isAdmin'] },
  fields: [
    { name: 'name', label: 'Nombre', type: 'text', required: true },
    {
      name: 'isAdmin',
      label: 'Administrador',
      type: 'checkbox',
      defaultValue: false,
      // El primer editor (con la base vacía) es administrador.
      hooks: {
        beforeChange: [
          async ({ operation, value, req }) => {
            const given = typeof value === 'boolean' ? value : undefined;
            if (operation !== 'create') return given;
            const { totalDocs } = await req.payload.count({ collection: 'users', req });
            return totalDocs === 0 ? true : given;
          },
        ],
      },
      access: {
        create: ({ req: { user } }) => isAdmin(user),
        update: ({ req: { user } }) => isAdmin(user),
      },
      admin: {
        position: 'sidebar',
        description: 'Puede crear, borrar y hacer administradores a otros editores.',
      },
    },
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
  hooks: { beforeChange: [closeAnonymousRegister], afterChange: [revalidateOnChange] },
};
