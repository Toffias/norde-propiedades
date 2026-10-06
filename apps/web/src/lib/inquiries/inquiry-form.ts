import { z } from 'zod';

// El formulario de consulta de la ficha. Se valida acá (borde) y otra vez en apps/gestion, que
// normaliza el teléfono y el email con las reglas del dominio.

export const INQUIRY_FIELDS = {
  name: 'nombre',
  email: 'email',
  phone: 'telefono',
  message: 'mensaje',
  propertyId: 'propiedad',
  /** Trampa para bots: un campo oculto que una persona deja vacío. */
  honeypot: 'sitio_web',
} as const;

type FieldName = 'name' | 'email' | 'phone' | 'message';

/** Lo que escribió la persona: vuelve con el error para no borrarle el formulario. */
export type InquiryFormValues = Readonly<Record<FieldName, string>>;

export type InquiryFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'sent' }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly fieldErrors?: Partial<Record<FieldName, string>>;
      readonly values?: InquiryFormValues;
    };

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? undefined : value));

const InquiryFormSchema = z
  .object({
    name: z.string().trim().min(2, 'Escribí tu nombre.').max(120, 'El nombre es muy largo.'),
    email: optionalText(254).pipe(z.email('Revisá el email.').optional()),
    phone: optionalText(40).pipe(
      z
        .string()
        .regex(/^[+\d][\d\s()-]{5,}$/, 'Revisá el teléfono.')
        .optional(),
    ),
    message: z
      .string()
      .trim()
      .min(1, 'Escribí tu consulta.')
      .max(2000, 'La consulta es muy larga (hasta 2.000 caracteres).'),
    propertyId: z.uuid(),
    honeypot: z.string().max(0),
  })
  .refine((data) => data.email !== undefined || data.phone !== undefined, {
    path: ['phone'],
    message: 'Dejanos un teléfono o un email para responderte.',
  });

export type InquiryFormData = z.output<typeof InquiryFormSchema>;

export type ParsedInquiryForm =
  | { readonly kind: 'valid'; readonly data: Omit<InquiryFormData, 'honeypot'> }
  | { readonly kind: 'bot' }
  | { readonly kind: 'invalid'; readonly state: InquiryFormState };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** Los valores escritos, para devolverlos con un error. */
export function inquiryFormValues(form: FormData): InquiryFormValues {
  return {
    name: text(form, INQUIRY_FIELDS.name),
    email: text(form, INQUIRY_FIELDS.email),
    phone: text(form, INQUIRY_FIELDS.phone),
    message: text(form, INQUIRY_FIELDS.message),
  };
}

export function parseInquiryForm(form: FormData): ParsedInquiryForm {
  const values = inquiryFormValues(form);
  const parsed = InquiryFormSchema.safeParse({
    ...values,
    propertyId: text(form, INQUIRY_FIELDS.propertyId),
    honeypot: text(form, INQUIRY_FIELDS.honeypot),
  });
  if (parsed.success) {
    const { honeypot: _honeypot, ...data } = parsed.data;
    return { kind: 'valid', data };
  }
  if (parsed.error.issues.some((issue) => issue.path[0] === 'honeypot')) return { kind: 'bot' };
  const fieldErrors: Partial<Record<FieldName, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'name' || field === 'email' || field === 'phone' || field === 'message') {
      fieldErrors[field] ??= issue.message;
    }
  }
  return {
    kind: 'invalid',
    state: { status: 'error', message: 'Revisá los datos marcados.', fieldErrors, values },
  };
}

const WINDOW_MS = 10 * 60_000;

/**
 * Límite de envíos por IP, en memoria: la web corre en una sola instancia. Frena a quien manda
 * el formulario en loop antes de que llegue al panel.
 */
export function createRateLimiter(max: number, now: () => number) {
  const windows = new Map<string, { readonly start: number; count: number }>();
  return (key: string): boolean => {
    const at = now();
    if (windows.size > 10_000) {
      for (const [ip, window] of windows) if (at - window.start >= WINDOW_MS) windows.delete(ip);
    }
    const current = windows.get(key);
    if (!current || at - current.start >= WINDOW_MS) {
      windows.set(key, { start: at, count: 1 });
      return true;
    }
    current.count += 1;
    return current.count <= max;
  };
}
