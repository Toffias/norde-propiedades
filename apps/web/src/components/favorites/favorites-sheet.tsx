'use client';

import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@norde/ui/components/sheet';
import { cn } from '@norde/ui/lib/utils';
import { CheckCircle2, Heart, House, X } from 'lucide-react';
import Link from 'next/link';
import { useActionState, useEffect, useRef, useState } from 'react';

import { isExternal } from '../../lib/properties/images';
import type { Favorite } from '../../lib/favorites/favorites';
import { FAVORITES_FIELDS as F, type FavoritesFormState } from '../../lib/favorites/favorites-form';
import { sendFavoritesInquiry } from '../../lib/favorites/send-favorites-inquiry';
import { useFavorites } from '../../lib/favorites/use-favorites';
import { SkeletonImage } from '../layout/skeleton-image';

const FIELD =
  'border-input bg-background w-full rounded-xl border px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive';
const LABEL = 'mb-1 block text-xs font-bold';

const INITIAL: FavoritesFormState = { status: 'idle' };

interface FavoritesSheetProps {
  /** Si el sitio puede mandar consultas al panel; si no, el panel solo lista los favoritos. */
  readonly formEnabled: boolean;
  /** Clases del botón del header (adapta los colores sobre la foto del hero). */
  readonly triggerClassName?: string;
}

/**
 * El botón de favoritos del header, con el contador, y el panel lateral: las propiedades guardadas
 * y un formulario para consultar por todas. Sin favoritos, el botón no se muestra.
 */
export function FavoritesSheet({ formEnabled, triggerClassName }: FavoritesSheetProps) {
  const { favorites } = useFavorites();
  const [open, setOpen] = useState(false);
  // El ID del envío: los reintentos lo reusan; después de un envío exitoso se genera otro.
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const count = favorites.length;
  if (count === 0 && !open) return null;

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next && submissionId === null) setSubmissionId(crypto.randomUUID());
    if (!next && sent) {
      setSent(false);
      setSubmissionId(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <button
        type="button"
        onClick={() => {
          onOpenChange(true);
        }}
        aria-label={`Ver mis favoritos (${count})`}
        className={cn(
          'relative grid size-10 place-items-center rounded-xl transition-colors',
          triggerClassName,
        )}
      >
        <Heart aria-hidden className="size-5" />
        {count > 0 && (
          <span className="bg-brand-600 absolute top-1 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[11px] leading-none font-bold text-white tabular-nums">
            {count}
          </span>
        )}
      </button>

      <SheetContent className="gap-0 sm:max-w-md">
        <div className="flex h-16 shrink-0 flex-col justify-center gap-0.5 border-b px-5 pr-14">
          <SheetTitle className="text-base font-bold">Mis favoritos</SheetTitle>
          <SheetDescription>
            {sent
              ? 'Consulta enviada'
              : count === 1
                ? '1 propiedad guardada'
                : `${count} propiedades guardadas`}
          </SheetDescription>
        </div>

        <div className="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto">
          {submissionId !== null && (
            // `key`: cada envío arranca con el estado del formulario vacío.
            <FavoritesPanel
              key={submissionId}
              submissionId={submissionId}
              formEnabled={formEnabled}
              onSent={() => {
                setSent(true);
              }}
              onClose={() => {
                onOpenChange(false);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FavoritesPanel({
  submissionId,
  formEnabled,
  onSent,
  onClose,
}: {
  readonly submissionId: string;
  readonly formEnabled: boolean;
  readonly onSent: () => void;
  readonly onClose: () => void;
}) {
  const { favorites, remove, clear } = useFavorites();
  const [state, action, pending] = useActionState(sendFavoritesInquiry, INITIAL);
  const sent = state.status === 'sent';
  const notified = useRef(false);

  // Enviado: se limpian los favoritos (una vez). El panel sigue abierto con el agradecimiento.
  useEffect(() => {
    if (!sent || notified.current) return;
    notified.current = true;
    clear();
    onSent();
  }, [sent, clear, onSent]);

  if (sent) return <Sent onClose={onClose} />;
  const count = favorites.length;
  return (
    <>
      <FavoritesList favorites={favorites} onRemove={remove} />
      {count > 0 && formEnabled && (
        <FavoritesForm
          favorites={favorites}
          submissionId={submissionId}
          state={state}
          action={action}
          pending={pending}
        />
      )}
      {count > 0 && !formEnabled && (
        <p className="text-muted-foreground border-t px-5 py-4 text-sm">
          Muy pronto vas a poder consultar por tus favoritos desde acá.
        </p>
      )}
    </>
  );
}

function FavoritesList({
  favorites,
  onRemove,
}: {
  readonly favorites: readonly Favorite[];
  readonly onRemove: (id: string) => void;
}) {
  if (favorites.length === 0) {
    return (
      <p className="text-muted-foreground px-5 py-8 text-center text-sm">
        No tenés propiedades en favoritos.
      </p>
    );
  }
  return (
    <ul className="divide-y px-5">
      {favorites.map((favorite) => (
        <li key={favorite.id} className="relative flex gap-3 py-3">
          <div className="bg-muted relative size-16 shrink-0 overflow-hidden rounded-xl">
            {favorite.cover ? (
              <SkeletonImage
                src={favorite.cover.src}
                alt={favorite.cover.alt}
                fill
                sizes="64px"
                unoptimized={isExternal(favorite.cover.src)}
                className="object-cover"
              />
            ) : (
              <div className="text-muted-foreground flex h-full items-center justify-center">
                <House aria-hidden className="size-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 pr-8">
            <p className="text-sm font-extrabold tracking-tight">{favorite.priceLabel}</p>
            <Link
              href={favorite.href}
              className="line-clamp-2 text-[13px] leading-snug font-semibold hover:underline"
            >
              {favorite.title}
            </Link>
            <p className="text-muted-foreground line-clamp-1 text-xs">{favorite.location}</p>
          </div>
          <button
            type="button"
            onClick={() => {
              onRemove(favorite.id);
            }}
            aria-label={`Quitar "${favorite.title}" de favoritos`}
            title="Quitar de favoritos"
            className="text-muted-foreground hover:text-foreground hover:bg-accent focus-visible:ring-ring/50 absolute top-3 right-0 grid size-8 place-items-center rounded-lg outline-none focus-visible:ring-[3px]"
          >
            <X aria-hidden className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function FieldError({ id, message }: { readonly id: string; readonly message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-destructive mt-1 text-xs font-medium">
      {message}
    </p>
  );
}

function FavoritesForm({
  favorites,
  submissionId,
  state,
  action,
  pending,
}: {
  readonly favorites: readonly Favorite[];
  readonly submissionId: string;
  readonly state: FavoritesFormState;
  readonly action: (form: FormData) => void;
  readonly pending: boolean;
}) {
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {};
  // React vacía el formulario después de cada envío: lo escrito vuelve en el estado.
  const values = state.status === 'error' ? state.values : undefined;
  const describedBy = (field: keyof typeof errors) =>
    errors[field] ? `favorites-${field}-error` : undefined;

  return (
    <form
      key={JSON.stringify(values ?? {})}
      action={action}
      noValidate
      className="bg-muted/40 mt-auto space-y-3 border-t px-5 py-5"
    >
      <div>
        <p className="font-bold">Consultá por tus favoritos</p>
        <p className="text-muted-foreground text-xs">
          Dejanos tus datos y te contactamos por{' '}
          {favorites.length === 1 ? 'esta propiedad' : `estas ${favorites.length} propiedades`}.
        </p>
      </div>
      {favorites.map((favorite) => (
        <input key={favorite.id} type="hidden" name={F.propertyIds} value={favorite.id} />
      ))}
      <input type="hidden" name={F.submissionId} value={submissionId} />
      {/* Trampa para bots: oculto para las personas y para los lectores de pantalla. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          No completar
          <input type="text" name={F.honeypot} tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <div>
        <label className={LABEL} htmlFor="favorites-name">
          Nombre
        </label>
        <input
          id="favorites-name"
          name={F.name}
          defaultValue={values?.name}
          autoComplete="name"
          required
          aria-invalid={Boolean(errors.name)}
          aria-describedby={describedBy('name')}
          className={`${FIELD} h-11`}
        />
        <FieldError id="favorites-name-error" {...(errors.name && { message: errors.name })} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor="favorites-phone">
            Teléfono
          </label>
          <input
            id="favorites-phone"
            name={F.phone}
            defaultValue={values?.phone}
            type="tel"
            autoComplete="tel"
            aria-invalid={Boolean(errors.phone)}
            aria-describedby={describedBy('phone')}
            className={`${FIELD} h-11`}
          />
          <FieldError id="favorites-phone-error" {...(errors.phone && { message: errors.phone })} />
        </div>
        <div>
          <label className={LABEL} htmlFor="favorites-email">
            Email
          </label>
          <input
            id="favorites-email"
            name={F.email}
            defaultValue={values?.email}
            type="email"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-describedby={describedBy('email')}
            className={`${FIELD} h-11`}
          />
          <FieldError id="favorites-email-error" {...(errors.email && { message: errors.email })} />
        </div>
      </div>
      <div>
        <label className={LABEL} htmlFor="favorites-message">
          Mensaje <span className="text-muted-foreground font-normal">(opcional)</span>
        </label>
        <textarea
          id="favorites-message"
          name={F.message}
          rows={3}
          maxLength={2000}
          defaultValue={values?.message}
          placeholder="Contanos qué buscás o cuándo te viene bien que te llamemos."
          aria-invalid={Boolean(errors.message)}
          aria-describedby={describedBy('message')}
          className={`${FIELD} py-2.5`}
        />
        <FieldError
          id="favorites-message-error"
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

function Sent({ onClose }: { readonly onClose: () => void }) {
  return (
    <div
      role="status"
      className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-10 text-center"
    >
      <CheckCircle2 aria-hidden className="text-whatsapp size-10" />
      <p className="font-bold">¡Gracias! Recibimos tu consulta.</p>
      <p className="text-muted-foreground text-sm">
        Te contactamos a la brevedad por las propiedades que guardaste.
      </p>
      <button
        type="button"
        onClick={onClose}
        className="hover:bg-accent mt-3 h-10 rounded-xl border px-4 text-sm font-bold transition-colors"
      >
        Seguir mirando
      </button>
    </div>
  );
}
