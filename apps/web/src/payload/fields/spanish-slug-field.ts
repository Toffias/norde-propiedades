import { slugField, type RowField, type TextFieldSingleValidation } from 'payload';
import { text } from 'payload/shared';

import { slugify } from '../../lib/slug';

/**
 * Campo `slug` de Payload con slugify apto para español y slugs reservados opcionales.
 * Se genera desde `title` hasta que el editor lo edita a mano.
 */
export function spanishSlugField(
  options: { readonly reserved?: readonly string[] } = {},
): RowField {
  const reserved = options.reserved ?? [];

  const validate: TextFieldSingleValidation = (value, args) => {
    // Vacío: lo resuelven la validación estándar (obligatorio al publicar) y la autogeneración.
    if (!value) return text(value, args);
    if (value !== slugify(value)) {
      return 'Usá solo minúsculas, números y guiones (sin acentos ni espacios).';
    }
    if (reserved.includes(value)) {
      return `"${value}" es una ruta reservada del sitio: elegí otro slug.`;
    }
    return true;
  };

  return slugField({
    position: 'sidebar',
    slugify: ({ valueToSlugify }) =>
      typeof valueToSlugify === 'string' ? slugify(valueToSlugify) : undefined,
    overrides: (row) => ({
      ...row,
      fields: row.fields.map((field) =>
        field.type === 'text' && field.name === 'slug' && !field.hasMany
          ? {
              ...field,
              label: 'Slug (URL)',
              validate,
              admin: { ...field.admin, description: 'Parte final de la URL. Sin acentos.' },
            }
          : field,
      ),
    }),
  });
}
