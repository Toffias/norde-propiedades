import { OPERATIONS, type Operation } from '@norde/core/properties/contracts';
import { z } from 'zod';

import { SUBSCRIPTION_FREQUENCIES, type SubscriptionFrequency } from './search-subscription';

// El formulario "Suscribirme a esta búsqueda" del listado (#208). Se valida acá (borde) y otra vez
// en apps/gestion, que normaliza el email con las reglas del dominio.

export const SUBSCRIBE_FIELDS = {
  name: 'nombre',
  email: 'email',
  frequency: 'frecuencia',
  /** Solo si el buscador no tenía operación. */
  operation: 'operacion',
  /** La búsqueda del listado, tal como está en la URL (`operacion=venta&tipo=departamento`). */
  search: 'busqueda',
  /** Trampa para bots: un campo oculto que una persona deja vacío. */
  honeypot: 'sitio_web',
} as const;

type FieldName = 'name' | 'email' | 'frequency' | 'operation';

export type SubscribeFormValues = Readonly<Record<FieldName, string>>;

export type SubscribeFormState =
  | { readonly status: 'idle' }
  | { readonly status: 'sent' }
  | {
      readonly status: 'error';
      readonly message: string;
      readonly fieldErrors?: Partial<Record<FieldName, string>>;
      readonly values?: SubscribeFormValues;
    };

const SubscribeFormSchema = z.object({
  name: z.string().trim().min(2, 'Escribí tu nombre.').max(120, 'El nombre es muy largo.'),
  email: z.string().trim().max(254).pipe(z.email('Revisá el email.')),
  frequency: z.enum(SUBSCRIPTION_FREQUENCIES, 'Elegí cada cuánto querés recibirlas.'),
  operation: z
    .string()
    .transform((value) => (value === '' ? undefined : value))
    .pipe(z.enum(OPERATIONS, 'Elegí si buscás comprar o alquilar.').optional()),
  search: z.string().max(4000),
  honeypot: z.string().max(0),
});

export interface SubscribeFormData {
  readonly name: string;
  readonly email: string;
  readonly frequency: SubscriptionFrequency;
  readonly operation: Operation | undefined;
  /** La query string del listado. */
  readonly search: string;
}

export type ParsedSubscribeForm =
  | { readonly kind: 'valid'; readonly data: SubscribeFormData }
  | { readonly kind: 'bot' }
  | { readonly kind: 'invalid'; readonly state: SubscribeFormState };

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

/** Los valores escritos, para devolverlos con un error. */
export function subscribeFormValues(form: FormData): SubscribeFormValues {
  return {
    name: text(form, SUBSCRIBE_FIELDS.name),
    email: text(form, SUBSCRIBE_FIELDS.email),
    frequency: text(form, SUBSCRIBE_FIELDS.frequency),
    operation: text(form, SUBSCRIBE_FIELDS.operation),
  };
}

export function parseSubscribeForm(form: FormData): ParsedSubscribeForm {
  const values = subscribeFormValues(form);
  const parsed = SubscribeFormSchema.safeParse({
    ...values,
    search: text(form, SUBSCRIBE_FIELDS.search),
    honeypot: text(form, SUBSCRIBE_FIELDS.honeypot),
  });
  if (parsed.success) {
    const { name, email, frequency, operation, search } = parsed.data;
    return { kind: 'valid', data: { name, email, frequency, operation, search } };
  }
  if (parsed.error.issues.some((issue) => issue.path[0] === 'honeypot')) return { kind: 'bot' };
  const fieldErrors: Partial<Record<FieldName, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (field === 'name' || field === 'email' || field === 'frequency' || field === 'operation') {
      fieldErrors[field] ??= issue.message;
    }
  }
  return {
    kind: 'invalid',
    state: { status: 'error', message: 'Revisá los datos marcados.', fieldErrors, values },
  };
}
