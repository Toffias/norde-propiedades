import type { NewsActivityDay, NewsPeriod } from '@norde/core/audit/contracts';
import { cn } from '@norde/ui/lib/utils';
import Link from 'next/link';
import { Fragment } from 'react';

import { newsDayLabel, newsDaySpanLabel, newsWeekdayInitial } from '../news-format';
import { newsPeriodHref, newsSectionAnchor, type NewsSection } from '../news-sections';
import { KIND_TONES, TONE_TEXT } from './news-visuals';

const LONG_DAY = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'UTC',
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

function longDay(day: string): string {
  return LONG_DAY.format(new Date(`${day}T12:00:00Z`)).replace(',', '');
}

/** "Hoy · viernes 31 de octubre", "Ayer · …" o "Del 25 al 31 de octubre". */
function periodTitle(period: NewsPeriod, days: readonly NewsActivityDay[], today: string) {
  if (period === 'week') return newsDaySpanLabel(days[0]?.day ?? today, today);
  const day = days.at(period === 'today' ? -1 : -2)?.day ?? today;
  return `${newsDayLabel(day, today)} · ${longDay(day)}`;
}

const LEADS: Readonly<Record<NewsPeriod, string>> = {
  today: 'Hoy',
  yesterday: 'Ayer',
  week: 'En los últimos 7 días',
};

/** "2 propiedades nuevas, 1 reserva y 3 contactos nuevos", con enlace a cada sección. */
function Parts({ parts }: { readonly parts: readonly SectionTotal[] }) {
  return parts.map(({ section, total }, index) => (
    <Fragment key={section.kind}>
      {index === 0 ? '' : index === parts.length - 1 ? ' y ' : ', '}
      <a
        href={`#${newsSectionAnchor(section.kind)}`}
        className={cn('font-semibold hover:underline', TONE_TEXT[KIND_TONES[section.kind]])}
      >
        {total} {total === 1 ? section.one : section.many}
      </a>
    </Fragment>
  ));
}

export interface SectionTotal {
  readonly section: NewsSection;
  readonly total: number;
}

/**
 * La cabecera del resumen: una frase con lo que pasó en el período y la actividad de los últimos
 * 7 días. Cada barra lleva al día; la semana entera, a "Últimos 7 días".
 */
export function NewsSummary({
  period,
  today,
  totals,
  activity,
}: {
  readonly period: NewsPeriod;
  readonly today: string;
  readonly totals: readonly SectionTotal[];
  readonly activity: readonly NewsActivityDay[];
}) {
  const parts = totals.filter((part) => part.total > 0);
  const total = parts.reduce((sum, part) => sum + part.total, 0);
  const peak = Math.max(1, ...activity.map((day) => day.count));
  const highlighted = (index: number) =>
    period === 'week' ||
    (period === 'today' && index === activity.length - 1) ||
    (period === 'yesterday' && index === activity.length - 2);

  return (
    <section className="relative grid gap-5 overflow-hidden rounded-xl border border-border bg-card p-5 shadow-xs sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <span className="absolute inset-y-0 left-0 w-[3px] bg-primary-500" aria-hidden />
      <div className="min-w-0">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {periodTitle(period, activity, today)}
        </p>
        <p className="mt-1.5 text-base leading-relaxed text-foreground">
          {total === 0 ? (
            <>
              {LEADS[period]} {period === 'today' ? 'todavía no hubo' : 'no hubo'} novedades.
              {period !== 'week' && (
                <>
                  {' '}
                  <Link
                    href={newsPeriodHref('week')}
                    className="text-sm font-medium whitespace-nowrap text-primary hover:underline"
                  >
                    Ver los últimos 7 días
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              {LEADS[period]} hubo{' '}
              <strong className="font-semibold">
                {total} {total === 1 ? 'novedad' : 'novedades'}
              </strong>
              : <Parts parts={parts} />.
            </>
          )}
        </p>
      </div>
      <nav aria-label="Actividad de los últimos 7 días" className="flex flex-col gap-1">
        <ol className="flex h-14 items-end gap-1.5">
          {activity.map((day, index) => {
            const label = `${newsDayLabel(day.day, today)}: ${String(day.count)} ${day.count === 1 ? 'novedad' : 'novedades'}`;
            const target: NewsPeriod | undefined =
              index === activity.length - 1
                ? 'today'
                : index === activity.length - 2
                  ? 'yesterday'
                  : undefined;
            const bar = (
              <span
                className={cn(
                  'block w-3.5 rounded-t-[3px] transition-colors',
                  highlighted(index) && day.count > 0
                    ? 'bg-primary-500'
                    : 'bg-muted dark:bg-white/10',
                )}
                // Un día sin novedades deja una raya gris, para que se vea que el día está.
                style={{
                  height:
                    day.count === 0 ? '3px' : `${String(Math.max(12, (day.count / peak) * 100))}%`,
                }}
              />
            );
            return (
              <li key={day.day} className="flex h-full items-end" title={label}>
                <Link
                  href={newsPeriodHref(target ?? 'week')}
                  aria-label={label}
                  className="flex h-full items-end rounded-t-[3px] focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {bar}
                </Link>
              </li>
            );
          })}
        </ol>
        <ol className="flex gap-1.5" aria-hidden>
          {activity.map((day) => (
            <li key={day.day} className="w-3.5 text-center text-[10px] text-muted-foreground">
              {newsWeekdayInitial(day.day)}
            </li>
          ))}
        </ol>
      </nav>
    </section>
  );
}
