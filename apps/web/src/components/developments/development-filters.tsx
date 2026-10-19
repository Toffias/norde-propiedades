import { cn } from '@norde/ui/lib/utils';
import Link from 'next/link';

import {
  CONSTRUCTION_STATUS_OPTIONS,
  DEVELOPMENT_TYPE_OPTIONS,
  developmentsHref,
  type DevelopmentFilters,
} from '../../lib/developments/listing-filters';

/** En mobile, una fila que se desliza; desde `sm`, los chips bajan de línea. */
const ROW =
  '-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0';

const CHIP =
  'inline-flex h-9 items-center rounded-full border px-3.5 text-sm font-semibold transition-colors';

function Chip({
  href,
  selected,
  children,
}: {
  readonly href: string;
  readonly selected: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <li className="shrink-0">
      <Link
        href={href}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          CHIP,
          selected
            ? 'bg-primary text-primary-foreground border-transparent'
            : 'bg-card hover:bg-muted',
        )}
      >
        {children}
      </Link>
    </li>
  );
}

/** Filtros del listado como links (funcionan sin JavaScript y se pueden compartir). */
export function DevelopmentFilterChips({ filters }: { readonly filters: DevelopmentFilters }) {
  return (
    <div className="space-y-3">
      <nav aria-label="Estado de obra">
        <ul className={ROW}>
          <Chip
            href={developmentsHref(filters, { constructionStatus: undefined })}
            selected={filters.constructionStatus === undefined}
          >
            Todos
          </Chip>
          {CONSTRUCTION_STATUS_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              href={developmentsHref(filters, { constructionStatus: option.value })}
              selected={filters.constructionStatus === option.value}
            >
              {option.label}
            </Chip>
          ))}
        </ul>
      </nav>
      <nav aria-label="Tipo de emprendimiento">
        <ul className={ROW}>
          <Chip
            href={developmentsHref(filters, { developmentType: undefined })}
            selected={filters.developmentType === undefined}
          >
            Todos los tipos
          </Chip>
          {DEVELOPMENT_TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              href={developmentsHref(filters, { developmentType: option.value })}
              selected={filters.developmentType === option.value}
            >
              {option.label}
            </Chip>
          ))}
        </ul>
      </nav>
    </div>
  );
}
