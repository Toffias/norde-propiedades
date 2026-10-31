import type { NewsPeriod } from '@norde/core/audit/contracts';
import { cn } from '@norde/ui/lib/utils';
import Link from 'next/link';

import { NEWS_PERIOD_LABELS, NEWS_PERIOD_ORDER, newsPeriodHref } from '../news-sections';

/**
 * Hoy, ayer o los últimos 7 días, como enlaces (el período va en la URL) con el aspecto de las
 * pills de `Tabs`.
 */
export function NewsPeriodTabs({ selected }: { readonly selected: NewsPeriod }) {
  return (
    <nav
      data-tour="news-period"
      aria-label="Período"
      className="inline-flex flex-wrap items-center gap-2"
    >
      {NEWS_PERIOD_ORDER.map((period) => {
        const active = period === selected;
        return (
          <Link
            key={period}
            href={newsPeriodHref(period)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex items-center justify-center rounded-full border px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50',
              active
                ? 'border-transparent bg-foreground text-background'
                : 'border-border bg-card text-secondary-foreground hover:bg-accent',
            )}
          >
            {NEWS_PERIOD_LABELS[period]}
          </Link>
        );
      })}
    </nav>
  );
}
