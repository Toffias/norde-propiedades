import { z } from 'zod';

import {
  CONTACT_FIELDS,
  MISSING_CONTACT_MESSAGE,
  optionalText,
  type InquiryFormValues,
} from '../inquiries/inquiry-form';
import { MAX_FAVORITES } from './favorites';

// El formulario del panel de favoritos: los datos de contacto, un mensaje opcional y las
// propiedades. Cada propiedad entra al panel como una consulta propia (ver `sendFavoritesInquiry`).

export const FAVORITES_FIELDS = {
  name: 'nombre',
  email: 'email',
  phone: 'telefono',
  message: 'mensaje',
  /** Uno por favorito. */
  propertyIds: 'propiedades',
  /** Lo genera el navegador por envío: un reintento no duplica las consultas. */
  submissionId: 'envio',
  /** Trampa para bots: un campo oculto que una persona deja vacío. */
  honeypot: 'sitio_web',
} as const;

type FieldName = keyof InquiryFormValues;

export type FavoritesFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'sent' }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly fieldErrors?: Partial<Record<FieldName, string>>;
      readonly values?: InquiryFormValues;
    };

const FavoritesFormSchema = z
  .object({
    ...CONTACT_FIELDS,
    message: optionalText(2000),
    propertyIds: z
      .array(z.uuid())
      .min(1, 'No tenés propiedades en favoritos.')
      .max(MAX_FAVORITES)
      .transform((ids) => [...new Set(ids.map((id) => id.toLowerCase()))]),
    submissionId: z.uuid(),
    honeypot: z.string().max(0),
  })
  .refine((data) => data.email !== undefined || data.phone !== undefined, {
    path: ['phone'],
    message: MISSING_CONTACT_MESSAGE,
  });

export type FavoritesFormData = Omit<z.output<typeof FavoritesFormSchema>, 'honeypot'>;

export type ParsedFavoritesForm =
  | { readonly kind: 'valid'; readonly data: FavoritesFormData }
  | { readonly kind: 'bot' }
  | { readonly kind: 'invalid'; readonly state: FavoritesFormState };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export function favoritesFormValues(form: FormData): InquiryFormValues {
  return {
    name: text(form, FAVORITES_FIELDS.name),
    email: text(form, FAVORITES_FIELDS.email),
    phone: text(form, FAVORITES_FIELDS.phone),
    message: text(form, FAVORITES_FIELDS.message),
  };
}

export function parseFavoritesForm(form: FormData): ParsedFavoritesForm {
  const values = favoritesFormValues(form);
  const parsed = FavoritesFormSchema.safeParse({
    ...values,
    propertyIds: form
      .getAll(FAVORITES_FIELDS.propertyIds)
      .filter((value): value is string => typeof value === 'string'),
    submissionId: text(form, FAVORITES_FIELDS.submissionId),
    honeypot: text(form, FAVORITES_FIELDS.honeypot),
  });
  if (parsed.success) {
    const { honeypot: _honeypot, ...data } = parsed.data;
    return { kind: 'valid', data };
  }
  const issues = parsed.error.issues;
  if (issues.some((issue) => issue.path[0] === 'honeypot')) return { kind: 'bot' };

  const fieldErrors: Partial<Record<FieldName, string>> = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (field === 'name' || field === 'email' || field === 'phone' || field === 'message') {
      fieldErrors[field] ??= issue.message;
    }
  }
  const noProperties = issues.some((issue) => issue.path[0] === 'propertyIds');
  return {
    kind: 'invalid',
    state: {
      status: 'error',
      message: noProperties
        ? 'No pudimos leer tus favoritos. Recargá la página y probá de nuevo.'
        : 'Revisá los datos marcados.',
      fieldErrors,
      values,
    },
  };
}

/** El texto de cada consulta: lo que escribió la persona, o uno por defecto. */
export function favoritesInquiryMessage(message: string | undefined, count: number): string {
  const intro =
    message ??
    'Hola, me interesan estas propiedades que guardé en favoritos. ¿Me pasan más información?';
  const origin =
    count === 1
      ? 'Consulta desde favoritos del sitio.'
      : `Consulta desde favoritos del sitio (${count} propiedades en el mismo envío).`;
  return `${intro}\n\n${origin}`;
}
