'use client';

import { toast } from '@norde/ui/components/sonner';
import { cn } from '@norde/ui/lib/utils';
import { StarIcon } from 'lucide-react';
import { useOptimistic, useTransition } from 'react';

import { runAction } from '../../../lib/action-result';
import { setDevelopmentFavoriteAction } from '../actions';

/** Estrella para marcar el emprendimiento como favorito de quien usa el panel. */
export function DevelopmentFavoriteToggle({
  developmentId,
  favorite,
  onChange,
}: {
  readonly developmentId: string;
  readonly favorite: boolean;
  /** Para quien muestra el valor sin volver a pedirlo al servidor (la vista rápida). */
  readonly onChange?: (favorite: boolean) => void;
}) {
  const [optimistic, setOptimistic] = useOptimistic(favorite);
  const [, startTransition] = useTransition();

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? 'Quitar de favoritos' : 'Marcar como favorito'}
      title={optimistic ? 'Quitar de favoritos' : 'Marcar como favorito'}
      className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
      onClick={() => {
        startTransition(async () => {
          setOptimistic(!optimistic);
          const message = await runAction(() =>
            setDevelopmentFavoriteAction({ developmentId, favorite: !optimistic }),
          );
          if (message === undefined) onChange?.(!optimistic);
          else toast.error(message);
        });
      }}
    >
      <StarIcon
        className={cn('h-5 w-5', optimistic && 'fill-warning-400 text-warning-500')}
        aria-hidden
      />
    </button>
  );
}
