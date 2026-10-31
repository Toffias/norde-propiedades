import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  NEWS_ACTIVITY_DAYS,
  NewsActivityQuerySchema,
  type GetNewsActivityQuery,
  type NewsActivity,
} from '../../contracts';
import { addDays, newsDayOf } from '../news-period';
import type { NewsFeedQuery, NewsScopeReader } from '../ports/news-feed-query';
import type { InvalidNewsQueryError } from './list-news';

export type GetNewsActivityError = ForbiddenError | InvalidNewsQueryError;

/**
 * La actividad de los últimos 7 días (hoy incluido) para el gráfico del resumen de Noticias: por
 * día, cuántas tarjetas hay entre todas las secciones. Pide `news:read` y respeta el alcance de
 * Noticias de la empresa, como `ListNews`.
 */
export class GetNewsActivity {
  constructor(
    private readonly deps: {
      readonly feed: NewsFeedQuery;
      readonly settings: NewsScopeReader;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: GetNewsActivityQuery,
    actor: Actor,
  ): Promise<Result<NewsActivity, GetNewsActivityError>> {
    if (!actor.can('news:read')) return err({ type: 'Forbidden' });
    const parsed = NewsActivityQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({
        type: 'InvalidInput',
        issues: parsed.error.issues.map((issue) => issue.message),
      });
    }
    const today = newsDayOf(this.deps.clock.now());
    const days = Array.from({ length: NEWS_ACTIVITY_DAYS }, (_, index) =>
      addDays(today, index - NEWS_ACTIVITY_DAYS + 1),
    );
    const { kinds } = parsed.data;
    if (kinds.length === 0) return ok({ days: days.map((day) => ({ day, count: 0 })) });

    const scope = await this.deps.settings.scope();
    const counts = await this.deps.feed.dailyCounts({
      kinds,
      branchId: scope === 'branch' ? actor.branchId : undefined,
      days: { from: days[0] ?? today, to: today },
    });
    const byDay = new Map(counts.map((row) => [row.day, row.count]));
    return ok({ days: days.map((day) => ({ day, count: byDay.get(day) ?? 0 })) });
  }
}
