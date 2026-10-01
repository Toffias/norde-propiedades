'use client';

import { toast } from '@norde/ui/components/sonner';
import { cn } from '@norde/ui/lib/utils';
import { StarIcon } from 'lucide-react';
import { useOptimistic, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { setPropertyFavoritesAction } from '../actions';

/** Estrella para marcar una propiedad como favorita de quien usa el panel. */
export function FavoriteToggle({
  propertyId,
  code,
  favorite,
}: {
  readonly propertyId: string;
  readonly code: string;
  readonly favorite: boolean;
}) {
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Quitar ${code} de favoritas` : `Marcar ${code} como favorita`}
      title={optimistic ? 'Quitar de favoritas' : 'Marcar como favorita'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={() => {
        startTransition(async () => {
          setOptimistic(!optimistic);
          const message = await runAction(() =>
            setPropertyFavoritesAction({ ids: [propertyId], favorite: !optimistic }),
          );
          if (message !== undefined) toast.error(message);
        });
      }}
    >
      <StarIcon
        className={cn('h-4 w-4', optimistic && 'fill-warning-400 text-warning-500')}
        aria-hidden
      />
    </button>
  );
}
