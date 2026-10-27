'use client';

import { cn } from '@norde/ui/lib/utils';
import { ThumbsDown, ThumbsUp } from 'lucide-react';
import { useState, useTransition } from 'react';

import { reactToSharedListing } from '../../lib/shared-listings/actions';
import type { ListingReaction } from '../../lib/shared-listings/load';

const FAILED: Readonly<Record<'invalid' | 'rate_limited' | 'unavailable', string>> = {
  invalid: 'No pudimos guardar tu respuesta.',
  rate_limited: 'Recibimos muchas respuestas seguidas. Probá de nuevo en unos minutos.',
  unavailable: 'Este link ya no está disponible.',
};

/** "Me gusta" / "No me gusta" de una propiedad del envío. Se puede cambiar de opinión. */
export function ReactionButtons({
  token,
  propertyId,
  title,
  initial,
}: {
  readonly token: string;
  readonly propertyId: string;
  readonly title: string;
  readonly initial: ListingReaction | null;
}) {
  const [reaction, setReaction] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(next: ListingReaction) {
    if (next === reaction) return;
    const previous = reaction;
    setReaction(next);
    setError(null);
    startTransition(async () => {
      const outcome = await reactToSharedListing({ token, propertyId, reaction: next }).catch(
        () => ({ ok: false as const, reason: 'invalid' as const }),
      );
      if (!outcome.ok) {
        setReaction(previous);
        setError(FAILED[outcome.reason]);
      }
    });
  }

  const button = (value: ListingReaction, label: string, Icon: typeof ThumbsUp) => (
    <button
      type="button"
      onClick={() => {
        choose(value);
      }}
      disabled={pending}
      aria-pressed={reaction === value}
      aria-label={`${label}: ${title}`}
      className={cn(
        'inline-flex flex-1 items-center justify-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60',
        reaction === value
          ? value === 'liked'
            ? 'border-brand-600 bg-brand-600 text-white'
            : 'border-foreground bg-foreground text-background'
          : 'bg-card hover:bg-muted',
      )}
    >
      <Icon aria-hidden className="size-4" />
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        {button('liked', 'Me gusta', ThumbsUp)}
        {button('disliked', 'No me gusta', ThumbsDown)}
      </div>
      <p aria-live="polite" className="text-destructive min-h-4 text-xs">
        {error}
      </p>
    </div>
  );
}
