import { cn } from '@norde/ui/lib/utils';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Link from 'next/link';

import { paginationItems } from '../../lib/pagination';

interface PaginationProps {
  readonly current: number;
  readonly total: number;
  /** Ruta de cada página (la 1 es la ruta base). */
  readonly hrefFor: (page: number) => string;
}

const ITEM =
  'inline-flex h-9 min-w-9 items-center justify-center rounded-md px-3 text-sm transition-colors';

/** Paginación con `<a href>` reales, que los buscadores pueden seguir. */
export function Pagination({ current, total, hrefFor }: PaginationProps) {
  if (total <= 1) return null;

  return (
    <nav aria-label="Paginación" className="mt-12 flex justify-center">
      <ul className="flex flex-wrap items-center gap-1">
        {current > 1 && (
          <li>
            <Link
              href={hrefFor(current - 1)}
              rel="prev"
              className={cn(ITEM, 'hover:bg-accent gap-1')}
            >
              <ChevronLeft aria-hidden className="size-4" />
              Anterior
            </Link>
          </li>
        )}
        {paginationItems(current, total).map((item) =>
          item.type === 'ellipsis' ? (
            <li key={item.key} aria-hidden className={cn(ITEM, 'text-muted-foreground')}>
              …
            </li>
          ) : (
            <li key={item.page}>
              <Link
                href={hrefFor(item.page)}
                aria-current={item.current ? 'page' : undefined}
                aria-label={`Página ${item.page}`}
                className={cn(
                  ITEM,
                  item.current ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {item.page}
              </Link>
            </li>
          ),
        )}
        {current < total && (
          <li>
            <Link
              href={hrefFor(current + 1)}
              rel="next"
              className={cn(ITEM, 'hover:bg-accent gap-1')}
            >
              Siguiente
              <ChevronRight aria-hidden className="size-4" />
            </Link>
          </li>
        )}
      </ul>
    </nav>
  );
}
