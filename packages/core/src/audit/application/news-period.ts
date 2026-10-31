import type { NewsPeriod } from '../contracts';
import type { NewsDayRange } from './ports/news-feed-query';

// Los días de Noticias son de Buenos Aires: una novedad de las 23:30 del lunes es del lunes,
// aunque en UTC ya sea martes.

const DAY_KEY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** El día de Buenos Aires de un instante (`AAAA-MM-DD`). */
export function newsDayOf(at: Date): string {
  return DAY_KEY.format(at);
}

/** Suma (o resta) días a un `AAAA-MM-DD`, sin pasar por la hora. */
export function addDays(day: string, amount: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

/** Los días que cubre un período, contados desde `today`. */
export function newsPeriodDays(period: NewsPeriod, today: string): NewsDayRange {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const yesterday = addDays(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case 'week':
      return { from: addDays(today, -6), to: today };
  }
}
