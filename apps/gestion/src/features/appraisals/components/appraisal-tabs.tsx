import { cn } from '@norde/ui/lib/utils';
import type { Route } from 'next';
import Link from 'next/link';

import { APPRAISAL_TAB_LABELS, APPRAISAL_TABS, type AppraisalTab } from '../labels';

/** Pestañas de la ficha de la tasación. Viven en la URL (`?tab=historial`). */
export function AppraisalTabs({
  appraisalId,
  active,
  showHistory,
}: {
  readonly appraisalId: string;
  readonly active: AppraisalTab;
  readonly showHistory: boolean;
}) {
  const tabs = APPRAISAL_TABS.filter((tab) => tab !== 'historial' || showHistory);
  return (
    <nav aria-label="Secciones de la ficha" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="inline-flex min-w-full gap-1 rounded-xl bg-muted p-1 sm:min-w-0">
        {tabs.map((tab) => (
          <li key={tab}>
            <Link
              // Misma ficha con otra pestaña: typedRoutes no verifica un string armado.
              href={`/tasaciones/${appraisalId}${tab === 'datos' ? '' : `?tab=${tab}`}` as Route}
              aria-current={tab === active ? 'page' : undefined}
              scroll={false}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground',
                tab === active && 'bg-background text-foreground shadow-sm dark:bg-card',
              )}
            >
              {APPRAISAL_TAB_LABELS[tab]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
