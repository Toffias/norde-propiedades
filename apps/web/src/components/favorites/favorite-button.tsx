'use client';

import { cn } from '@norde/ui/lib/utils';
import { Heart } from 'lucide-react';

import { MAX_FAVORITES, type Favorite } from '../../lib/favorites/favorites';
import { useFavorites } from '../../lib/favorites/use-favorites';

interface FavoriteButtonProps {
  readonly favorite: Favorite;
  /** `card`: redondo, sobre la foto de la tarjeta. `detail`: con texto, en la ficha. */
  readonly variant?: 'card' | 'detail';
  readonly className?: string;
}

/** Marca o desmarca la propiedad como favorita (se guarda en el navegador). */
export function FavoriteButton({ favorite, variant = 'card', className }: FavoriteButtonProps) {
  const { has, toggle, isFull } = useFavorites();
  const active = has(favorite.id);
  const blocked = !active && isFull;
  const label = active
    ? 'Quitar de favoritos'
    : blocked
      ? `Llegaste al máximo de ${MAX_FAVORITES} favoritos`
      : 'Guardar en favoritos';

  const icon = (
    <Heart
      aria-hidden
      className={cn(
        'size-[18px] transition-transform duration-200 motion-reduce:transition-none',
        active && 'fill-current',
      )}
    />
  );

  if (variant === 'detail') {
    return (
      <button
        type="button"
        aria-pressed={active}
        disabled={blocked}
        title={blocked ? label : undefined}
        onClick={() => {
          toggle(favorite);
        }}
        className={cn(
          'focus-visible:ring-ring/50 inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-bold transition-colors outline-none focus-visible:ring-[3px] disabled:opacity-50',
          active
            ? 'border-brand-200 bg-brand-50 text-brand-700 dark:border-brand-800 dark:bg-brand-900/40 dark:text-brand-300'
            : 'hover:bg-accent',
          className,
        )}
      >
        {icon}
        {active ? 'En favoritos' : 'Guardar en favoritos'}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      title={label}
      disabled={blocked}
      onClick={() => {
        toggle(favorite);
      }}
      className={cn(
        // Por encima del link que cubre la tarjeta.
        'focus-visible:ring-ring/50 relative z-10 grid size-9 place-items-center rounded-full shadow-sm backdrop-blur transition-colors outline-none focus-visible:ring-[3px] active:[&>svg]:scale-90 disabled:opacity-60',
        active
          ? 'bg-brand-600 hover:bg-brand-700 text-white'
          : 'text-foreground bg-white/90 hover:bg-white dark:bg-black/60 dark:hover:bg-black/75',
        className,
      )}
    >
      {icon}
    </button>
  );
}
