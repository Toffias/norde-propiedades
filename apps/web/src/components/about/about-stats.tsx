import { cn } from '@norde/ui/lib/utils';

import type { AboutStat } from '../../lib/about/about-content';
import { CountUp } from './count-up';
import { Reveal } from './reveal';

const COLUMNS: Readonly<Record<number, string>> = {
  1: 'sm:grid-cols-1',
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
};

/** Las cifras de Norde, que cuentan al aparecer en pantalla. */
export function AboutStats({ stats }: { readonly stats: readonly AboutStat[] }) {
  if (stats.length === 0) return null;

  return (
    <section aria-label="Norde en números" className="mx-auto max-w-6xl px-4 sm:px-6">
      <dl className={cn('grid gap-3', COLUMNS[stats.length])}>
        {stats.map((stat, index) => (
          <Reveal
            key={stat.id}
            delayMs={index * 80}
            className="bg-card flex flex-col-reverse gap-1 rounded-3xl border p-5"
          >
            <dt className="text-muted-foreground text-sm">{stat.label}</dt>
            <dd className="text-4xl leading-none font-extrabold sm:text-5xl">
              <CountUp stat={stat} />
            </dd>
          </Reveal>
        ))}
      </dl>
    </section>
  );
}
