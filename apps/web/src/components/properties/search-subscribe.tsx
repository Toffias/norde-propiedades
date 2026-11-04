'use client';

import type { Operation } from '@norde/core/properties/contracts';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@norde/ui/components/dialog';
import { cn } from '@norde/ui/lib/utils';
import { BellRing, MailCheck } from 'lucide-react';
import { useActionState, useState } from 'react';

import { OPERATION_LABELS } from '../../lib/properties/labels';
import {
  FREQUENCY_LABELS,
  SUBSCRIPTION_FREQUENCIES,
} from '../../lib/subscriptions/search-subscription';
import {
  SUBSCRIBE_FIELDS as F,
  type SubscribeFormState,
} from '../../lib/subscriptions/subscribe-form';
import { subscribeToSearch } from '../../lib/subscriptions/subscribe-to-search';

const FIELD =
  'border-input bg-background h-11 w-full rounded-xl border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';
const LABEL = 'mb-1 block text-xs font-bold';
const PRIMARY =
  'bg-primary text-primary-foreground hover:bg-primary-700 focus-visible:ring-ring/50 inline-flex items-center justify-center gap-2 rounded-xl text-sm font-bold transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-60';

const OPERATIONS: readonly Operation[] = ['sale', 'rent', 'temporary_rent'];
const INITIAL: SubscribeFormState = { status: 'idle' };

interface SearchSubscribeProps {
  /** La query string del listado: la búsqueda que se guarda. */
  readonly search: string;
  /** Cómo se va a titular la búsqueda ("Departamentos en venta en Palermo, hasta USD 150.000"). */
  readonly summary: string;
  /** El buscador no tiene operación: la persona la elige. */
  readonly needsOperation: boolean;
  /** Filtros aplicados que la suscripción no guarda ("dormitorios", "cochera"). */
  readonly ignored: readonly string[];
  /** Sin resultados: el aviso pasa a ser lo principal. */
  readonly empty?: boolean;
}

function FieldError({ id, message }: { readonly id: string; readonly message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive mt-1 text-xs font-medium">
      {message}
    </p>
  );
}

/**
 * "¿No encontraste lo que buscabas?": suscribirse a la búsqueda del listado para recibir por email
 * las propiedades nuevas que coincidan (#208). Pide confirmar el email antes de mandar nada.
 */
export function SearchSubscribe({
  search,
  summary,
  needsOperation,
  ignored,
  empty = false,
}: SearchSubscribeProps) {
  const [open, setOpen] = useState(false);
  // Cada vez que se abre arranca de cero: un formulario nuevo con su propio estado.
  const [attempt, setAttempt] = useState(0);

  return (
    <aside
      aria-labelledby="search-subscribe-title"
      className={cn(
        'bg-card flex flex-col gap-4 rounded-3xl border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6',
        empty ? 'mt-6' : 'mt-8',
      )}
    >
      <div className="flex gap-3">
        <span className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-full">
          <BellRing aria-hidden className="size-5" />
        </span>
        <div>
          <h2 id="search-subscribe-title" className="font-bold">
            ¿No encontraste lo que buscabas?
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Suscribite y recibí antes que nadie las propiedades que se ajusten a tu búsqueda.
          </p>
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setAttempt((value) => value + 1);
        }}
      >
        <DialogTrigger className={cn(PRIMARY, 'h-11 shrink-0 px-5')}>
          Suscribirme a esta búsqueda
        </DialogTrigger>
        <DialogContent className="max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] overflow-y-auto rounded-3xl sm:max-w-md">
          <SubscribeForm
            key={attempt}
            search={search}
            summary={summary}
            needsOperation={needsOperation}
            ignored={ignored}
            onClose={() => {
              setOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </aside>
  );
}

function SubscribeForm({
  search,
  summary,
  needsOperation,
  ignored,
  onClose,
}: Omit<SearchSubscribeProps, 'empty'> & { readonly onClose: () => void }) {
  const [state, action, pending] = useActionState(subscribeToSearch, INITIAL);

  if (state.status === 'sent') {
    return (
      <div role="status" className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheck aria-hidden className="text-primary size-10" />
        <DialogTitle className="text-lg font-extrabold">Revisá tu email</DialogTitle>
        <DialogDescription className="text-muted-foreground text-sm">
          Te mandamos un link para confirmar la suscripción. Hasta que no lo abras, no te vamos a
          mandar nada. Si no lo ves, fijate en la carpeta de spam.
        </DialogDescription>
        <button type="button" onClick={onClose} className={cn(PRIMARY, 'mt-2 h-11 w-full')}>
          Listo
        </button>
      </div>
    );
  }

  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  const values = state.status === 'error' ? state.values : undefined;
  const describedBy = (field: keyof typeof errors) =>
    errors[field] ? `subscribe-${field}-error` : undefined;
  const frequency = values?.frequency ?? 'weekly';

  return (
    <>
      <DialogTitle className="pr-8 text-xl font-extrabold">Suscribirme a esta búsqueda</DialogTitle>
      <DialogDescription className="text-muted-foreground text-sm">
        Te avisamos por email cuando se publique una propiedad que coincida, o cuando baje de
        precio.
      </DialogDescription>
      <p className="bg-muted rounded-xl px-3 py-2 text-sm font-semibold">{summary}</p>
      {ignored.length > 0 && (
        <p className="text-muted-foreground -mt-1 text-xs">
          No tenemos en cuenta {joinWithAnd(ignored)}: te llegan las que coincidan con el resto.
        </p>
      )}

      <form key={JSON.stringify(values ?? {})} action={action} className="space-y-3" noValidate>
        <input type="hidden" name={F.search} value={search} />
        {/* Trampa para bots: oculto para las personas y para los lectores de pantalla. */}
        <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
          <label>
            No completar
            <input type="text" name={F.honeypot} tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        {needsOperation && (
          <div>
            <label className={LABEL} htmlFor="subscribe-operation">
              ¿Qué buscás?
            </label>
            <select
              id="subscribe-operation"
              name={F.operation}
              defaultValue={values?.operation ?? 'sale'}
              aria-invalid={Boolean(errors.operation)}
              aria-describedby={describedBy('operation')}
              className={FIELD}
            >
              {OPERATIONS.map((operation) => (
                <option key={operation} value={operation}>
                  {OPERATION_LABELS[operation]}
                </option>
              ))}
            </select>
            <FieldError
              id="subscribe-operation-error"
              {...(errors.operation && { message: errors.operation })}
            />
          </div>
        )}
        <div>
          <label className={LABEL} htmlFor="subscribe-name">
            Nombre
          </label>
          <input
            id="subscribe-name"
            name={F.name}
            defaultValue={values?.name}
            autoComplete="name"
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={describedBy('name')}
            className={FIELD}
          />
          <FieldError id="subscribe-name-error" {...(errors.name && { message: errors.name })} />
        </div>
        <div>
          <label className={LABEL} htmlFor="subscribe-email">
            Email
          </label>
          <input
            id="subscribe-email"
            name={F.email}
            defaultValue={values?.email}
            type="email"
            autoComplete="email"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy('email')}
            className={FIELD}
          />
          <FieldError id="subscribe-email-error" {...(errors.email && { message: errors.email })} />
        </div>
        <fieldset aria-describedby={describedBy('frequency')}>
          <legend className={LABEL}>¿Cada cuánto querés recibirlas?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {SUBSCRIPTION_FREQUENCIES.map((option) => (
              <label
                key={option}
                className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 has-[:focus-visible]:ring-ring/50 flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold has-[:focus-visible]:ring-[3px]"
              >
                <input
                  type="radio"
                  name={F.frequency}
                  value={option}
                  defaultChecked={option === frequency}
                  className="accent-primary"
                />
                {FREQUENCY_LABELS[option]}
              </label>
            ))}
          </div>
          <FieldError
            id="subscribe-frequency-error"
            {...(errors.frequency && { message: errors.frequency })}
          />
        </fieldset>

        {state.status === 'error' && (
          <p role="alert" className="text-destructive text-sm font-medium">
            {state.message}
          </p>
        )}

        <button type="submit" disabled={pending} className={cn(PRIMARY, 'h-12 w-full')}>
          {pending ? 'Enviando…' : 'Suscribirme'}
        </button>
        <p className="text-muted-foreground text-xs">
          Te vamos a pedir que confirmes tu email. Usamos tus datos solo para mandarte estas
          propiedades y te podés dar de baja desde cualquiera de los emails.
        </p>
      </form>
    </>
  );
}

/** "dormitorios", "dormitorios y baños", "dormitorios, baños y cochera". */
function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} y ${items.at(-1) ?? ''}`;
}
