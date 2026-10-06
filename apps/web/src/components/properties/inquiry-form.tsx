'use client';

import { CheckCircle2 } from 'lucide-react';
import { useActionState } from 'react';

import { INQUIRY_FIELDS as F, type InquiryFormState } from '../../lib/inquiries/inquiry-form';
import { sendInquiry } from '../../lib/inquiries/send-inquiry';

const FIELD =
  'border-input bg-background w-full rounded-xl border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';
const LABEL = 'mb-1 block text-xs font-bold';

interface InquiryFormProps {
  readonly propertyId: string;
  readonly propertyTitle: string;
}

const INITIAL: InquiryFormState = { status: 'idle' };

function FieldError({ id, message }: { readonly id: string; readonly message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive mt-1 text-xs font-medium">
      {message}
    </p>
  );
}

/** Formulario de consulta de la ficha: entra como consulta en la bandeja del panel. */
export function InquiryForm({ propertyId, propertyTitle }: InquiryFormProps) {
  const [state, action, pending] = useActionState(sendInquiry, INITIAL);

  if (state.status === 'sent') {
    return (
      <div role="status" className="flex flex-col items-center gap-2 py-6 text-center">
        <CheckCircle2 aria-hidden className="text-whatsapp size-9" />
        <p className="font-bold">¡Gracias! Recibimos tu consulta.</p>
        <p className="text-muted-foreground text-sm">Te respondemos a la brevedad.</p>
      </div>
    );
  }

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  // React vacía el formulario después de cada envío: lo escrito vuelve en el estado.
  const values = state.status === 'error' ? state.values : undefined;
  const describedBy = (field: keyof typeof errors) =>
    errors[field] ? `inquiry-${field}-error` : undefined;

  return (
    // `key`: con cada respuesta se vuelve a montar, así toma los `defaultValue` nuevos.
    <form key={JSON.stringify(values ?? {})} action={action} className="space-y-3" noValidate>
      <input type="hidden" name={F.propertyId} value={propertyId} />
      {/* Trampa para bots: oculto para las personas y para los lectores de pantalla. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input type="text" name={F.honeypot} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div>
        <label className={LABEL} htmlFor="inquiry-name">
          Nombre
        </label>
        <input
          id="inquiry-name"
          name={F.name}
          defaultValue={values?.name}
          autoComplete="name"
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy('name')}
          className={`${FIELD} h-11`}
        />
        <FieldError id="inquiry-name-error" {...(errors.name && { message: errors.name })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="inquiry-phone">
            Teléfono
          </label>
          <input
            id="inquiry-phone"
            name={F.phone}
            defaultValue={values?.phone}
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={describedBy('phone')}
            className={`${FIELD} h-11`}
          />
          <FieldError id="inquiry-phone-error" {...(errors.phone && { message: errors.phone })} />
        </div>
        <div>
          <label className={LABEL} htmlFor="inquiry-email">
            Email
          </label>
          <input
            id="inquiry-email"
            name={F.email}
            defaultValue={values?.email}
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy('email')}
            className={`${FIELD} h-11`}
          />
          <FieldError id="inquiry-email-error" {...(errors.email && { message: errors.email })} />
        </div>
      </div>
      <div>
        <label className={LABEL} htmlFor="inquiry-message">
          Consulta
        </label>
        <textarea
          id="inquiry-message"
          name={F.message}
          rows={4}
          required
          maxLength={2000}
          defaultValue={
            values?.message ?? `Hola, me interesa "${propertyTitle}". ¿Me pasan más información?`
          }
          aria-invalid={Boolean(errors.message)}
          aria-describedby={describedBy('message')}
          className={`${FIELD} py-2.5`}
        />
        <FieldError
          id="inquiry-message-error"
          {...(errors.message && { message: errors.message })}
        />
      </div>

      {state.status === 'error' && (
        <p role="alert" className="text-destructive text-sm font-medium">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="bg-primary text-primary-foreground hover:bg-primary-700 focus-visible:ring-ring/50 h-12 w-full rounded-xl text-sm font-bold transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-60"
      >
        {pending ? 'Enviando…' : 'Enviar consulta'}
      </button>
      <p className="text-muted-foreground text-xs">
        Usamos tus datos solo para responder esta consulta.
      </p>
    </form>
  );
}
