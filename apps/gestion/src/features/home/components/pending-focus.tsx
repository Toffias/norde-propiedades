'use client';

import { cn } from '@norde/ui/lib/utils';
import { ArrowDownIcon, ArrowRightIcon } from 'lucide-react';
import type { Route } from 'next';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, useOptimistic, useTransition, type ReactNode } from 'react';

import { PENDING_FOCUS_PARAM, type PendingFocus } from '../home-params';

export interface PendingFocusTile {
  readonly key: PendingFocus;
  readonly label: string;
  /** El cuerpo de la tarjeta, armado en el servidor. */
  readonly content: ReactNode;
}

/**
 * Las tarjetas de Pendientes funcionan como filtro: la activa se resalta y su lista es lo único que
 * se ve abajo. Cambia al instante y queda en la URL (`?pendiente=`), así se puede recargar.
 */
export function PendingFocusTabs({
  active,
  tiles,
  children,
}: {
  readonly active: PendingFocus;
  readonly tiles: readonly PendingFocusTile[];
  /** La lista de la tarjeta activa. */
  readonly children: ReactNode;
}) {
  const id = useId();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [current, setCurrent] = useOptimistic(active);
  const [pending, startTransition] = useTransition();

  function select(key: PendingFocus) {
    if (key === current) return;
    const params = new URLSearchParams(searchParams);
    params.set(PENDING_FOCUS_PARAM, key);
    // Misma ruta con otros query params: typedRoutes no puede verificar un string armado.
    const href = `${pathname}?${params.toString()}` as Route;
    startTransition(() => {
      setCurrent(key);
      router.replace(href, { scroll: false });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div
        data-tour="home-pending"
        role="tablist"
        aria-label="Pendientes"
        className={cn(
          'grid grid-cols-2 gap-3 sm:gap-4',
          tiles.length >= 4 && 'xl:grid-cols-4',
          tiles.length === 3 && 'xl:grid-cols-3',
        )}
      >
        {tiles.map((tile) => {
          const selected = tile.key === current;
          return (
            <button
              key={tile.key}
              type="button"
              role="tab"
              id={`${id}-${tile.key}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              onClick={() => {
                select(tile.key);
              }}
              className={cn(
                'group relative flex h-full flex-col overflow-visible rounded-[14px] border bg-card text-left text-card-foreground transition-all duration-200 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
                selected
                  ? 'border-primary shadow-lg ring-2 ring-primary'
                  : 'cursor-pointer border-border opacity-70 hover:-translate-y-1 hover:border-foreground/25 hover:opacity-100 hover:shadow-md',
              )}
            >
              <span className="flex h-full flex-col overflow-hidden rounded-[13px]">
                {tile.content}
                <span
                  className={cn(
                    'flex items-center gap-1.5 border-t px-4 py-2 text-xs font-semibold transition-colors sm:px-5 sm:py-2.5',
                    selected
                      ? 'border-primary/20 bg-primary text-primary-foreground'
                      : 'border-border text-muted-foreground group-hover:bg-accent group-hover:text-foreground',
                  )}
                >
                  {selected ? (
                    <>
                      <ArrowDownIcon className="size-3.5" aria-hidden />
                      <span className="sm:hidden">Viendo</span>
                      <span className="hidden sm:inline">Viendo la lista abajo</span>
                    </>
                  ) : (
                    <>
                      Ver<span className="hidden sm:inline"> esta lista</span>
                      <ArrowRightIcon
                        className="size-3.5 transition-transform group-hover:translate-x-0.5"
                        aria-hidden
                      />
                    </>
                  )}
                </span>
              </span>
              {selected && (
                <span
                  aria-hidden
                  className="absolute -bottom-[7px] left-1/2 hidden size-3 -translate-x-1/2 rotate-45 bg-primary sm:block"
                />
              )}
            </button>
          );
        })}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-${current}`}
        aria-busy={pending}
        className={cn('transition-opacity', pending && 'opacity-50')}
      >
        {children}
      </div>
    </div>
  );
}
