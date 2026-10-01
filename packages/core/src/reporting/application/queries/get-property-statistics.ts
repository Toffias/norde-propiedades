import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import {
  PropertyStatisticsQuerySchema,
  type PropertyStatistics,
  type PropertyStatisticsInput,
} from '../../contracts';
import { lastMonths, shiftMonth, startOfMonth } from '../months';
import type { ReportingPropertyProfiles } from '../ports/property-profiles';
import type { PropertyStatisticsQuery } from '../ports/property-statistics-query';

export type GetPropertyStatisticsError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | { readonly type: 'PropertyNotFound' };

/** Etiquetas del perfil de interesados que se muestran. */
const TOP_TAGS = 10;

/**
 * Estadísticas de la ficha: envíos por email y WhatsApp, interesados, consultas y publicaciones
 * activas; el gráfico de los últimos meses (todos, también los que no tuvieron actividad) y el
 * perfil de los interesados por etiqueta.
 */
export class GetPropertyStatistics {
  constructor(
    private readonly deps: {
      readonly profiles: ReportingPropertyProfiles;
      readonly statistics: PropertyStatisticsQuery;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: PropertyStatisticsInput,
    actor: Actor,
  ): Promise<Result<PropertyStatistics, GetPropertyStatisticsError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = PropertyStatisticsQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { propertyId, months } = parsed.data;
    const profile = await this.deps.profiles.find(propertyId, actor);
    if (!profile) return err({ type: 'PropertyNotFound' });

    const calendar = lastMonths(this.deps.clock.now(), months);
    const first = calendar[0] ?? '';
    const last = calendar.at(-1) ?? first;
    const range = { from: startOfMonth(first), to: startOfMonth(shiftMonth(last, 1)) };
    const [activity, interested, tags, publications] = await Promise.all([
      this.deps.statistics.monthly(propertyId, range),
      this.deps.statistics.interestedCount(profile),
      this.deps.statistics.interestedTags(profile, TOP_TAGS),
      this.deps.statistics.publications(propertyId, range),
    ]);

    const byMonth = new Map(activity.map((row) => [row.month, row]));
    const monthly = calendar.map((month) => ({
      month,
      emailSends: byMonth.get(month)?.emailSends ?? 0,
      whatsappSends: byMonth.get(month)?.whatsappSends ?? 0,
      inquiries: byMonth.get(month)?.inquiries ?? 0,
    }));
    const sum = (field: 'emailSends' | 'whatsappSends' | 'inquiries') =>
      monthly.reduce((total, row) => total + row[field], 0);
    return ok({
      totals: {
        emailSends: sum('emailSends'),
        whatsappSends: sum('whatsappSends'),
        interested,
        inquiries: sum('inquiries'),
        activePublications: publications.filter((p) => p.status === 'published').length,
      },
      monthly,
      interestedProfile: tags,
      publications,
    });
  }
}
