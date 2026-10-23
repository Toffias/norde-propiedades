import type { ListingOwnerKindValue, PortalValue } from '@norde/core/portals/contracts';
import type {
  PublicationBucketValue,
  PublicationCountsView,
} from '@norde/core/reporting/contracts';
import { STATUS_DOT } from '@norde/ui/components/status-pill';
import { cn } from '@norde/ui/lib/utils';
import Link from 'next/link';

import { BUCKET_LABELS, COUNTER_ORDER } from '../labels';
import { portalPath } from '../paths';

/**
 * Los contadores de un portal para un tipo de aviso. Cada uno abre su listado; el elegido queda
 * marcado.
 */
export function PortalCounters({
  portal,
  kind,
  counts,
  active,
}: {
  readonly portal: PortalValue;
  readonly kind: ListingOwnerKindValue;
  readonly counts: PublicationCountsView;
  readonly active?: PublicationBucketValue;
}) {
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {COUNTER_ORDER.map((bucket) => {
        const { label, hint, tone } = BUCKET_LABELS[bucket];
        const current = bucket === active;
        return (
          <li key={bucket}>
            <Link
              href={portalPath(portal, kind, bucket)}
              aria-current={current ? 'page' : undefined}
              scroll={false}
              title={hint}
              className={cn(
                'flex h-full flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5 transition-colors hover:border-primary/50 hover:bg-muted/50',
                current && 'border-primary bg-primary/5 hover:bg-primary/5',
              )}
            >
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <span
                  className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[tone])}
                  aria-hidden
                />
                {label}
              </span>
              <span className="font-display text-xl leading-tight font-semibold tabular-nums">
                {counts[bucket]}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
