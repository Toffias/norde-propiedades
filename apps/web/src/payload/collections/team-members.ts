import type { CollectionConfig, TextFieldSingleValidation } from 'payload';

import { anyone, authenticated } from '../access';
import { revalidateOnChange, revalidateOnDelete } from '../hooks/revalidate-blog';

/** WhatsApp en el formato de los links `wa.me`: código de país y número, solo dígitos. */
const WHATSAPP_DIGITS = /^\d{10,15}$/;

const validateWhatsapp: TextFieldSingleValidation = (value) =>
  !value || WHATSAPP_DIGITS.test(value)
    ? true
    : 'Solo números, con el código de país y sin el 0 ni el 15 (ej.: 5491161798942).';

/**
 * El equipo que se muestra en "Nosotros". Es contenido editorial: el perfil público de cada
 * persona (nombre, cargo, foto, matrícula), no los usuarios del panel de gestión.
 */
export const TeamMembers: CollectionConfig<'team-members'> = {
  slug: 'team-members',
  labels: { singular: 'Integrante', plural: 'Equipo' },
  access: { read: anyone, create: authenticated, update: authenticated, delete: authenticated },
  admin: {
    group: 'Nosotros',
    useAsTitle: 'name',
    defaultColumns: ['name', 'role', 'order', 'active'],
  },
  defaultSort: 'order',
  fields: [
    { name: 'name', label: 'Nombre y apellido', type: 'text', required: true },
    {
      name: 'role',
      label: 'Cargo',
      type: 'text',
      required: true,
      admin: { description: 'Ej.: "Martillera y corredora pública" o "Asesor comercial".' },
    },
    {
      name: 'area',
      label: 'Área',
      type: 'text',
      admin: { description: 'Etiqueta corta sobre la foto. Ej.: "Ventas", "Alquileres".' },
    },
    {
      name: 'license',
      label: 'Matrícula',
      type: 'text',
      admin: { description: 'Ej.: "CUCICBA 1234". Se muestra debajo del cargo.' },
    },
    {
      name: 'photo',
      label: 'Foto',
      type: 'upload',
      relationTo: 'media',
      admin: { description: 'Vertical (4:5), con la cara centrada.' },
    },
    {
      name: 'whatsapp',
      label: 'WhatsApp',
      type: 'text',
      validate: validateWhatsapp,
      admin: {
        description:
          'Solo números, con el código de país (ej.: 5491161798942). Vacío: se usa el WhatsApp de la inmobiliaria.',
      },
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
