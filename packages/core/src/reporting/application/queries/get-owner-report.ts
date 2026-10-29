import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  MAX_OWNER_REPORT_DAYS,
  OwnerReportQuerySchema,
  type OwnerReport,
  type OwnerReportInput,
} from '../../contracts';
import { endOfDay, monthOf, shiftMonth, startOfDay } from '../months';
import type { ReportingPropertyProfiles } from '../ports/property-profiles';
import type { PropertyStatisticsQuery } from '../ports/property-statistics-query';

export type GetOwnerReportError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | { readonly type: 'PropertyNotFound' }
  | { readonly type: 'ReportPeriodTooLong'; readonly maxDays: number };

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * El reporte al propietario de un período: dónde está publicada, cuánto la vieron en cada portal,
 * cuántas veces se envió y cuántas consultas recibió. Sin datos de los clientes.
 */
export class GetOwnerReport {
  constructor(
    private readonly deps: {
      readonly profiles: ReportingPropertyProfiles;
      readonly statistics: PropertyStatisticsQuery;
    },
  ) {}

  async execute(
    input: OwnerReportInput,
    actor: Actor,
  ): Promise<Result<OwnerReport, GetOwnerReportError>> {
    if (!actor.can('properties:read')) return err({ type: 'Forbidden' });
    const parsed = OwnerReportQuerySchema.safeParse(input);
    if (!parsed.success) {
      return err({ type: 'InvalidInput', issues: parsed.error.issues.map((i) => i.message) });
    }
    const { propertyId, from, to } = parsed.data;
    const range = { from: startOfDay(from), to: endOfDay(to) };
    if ((range.to.getTime() - range.from.getTime()) / DAY_MS > MAX_OWNER_REPORT_DAYS) {
      return err({ type: 'ReportPeriodTooLong', maxDays: MAX_OWNER_REPORT_DAYS });
    }
    const profile = await this.deps.profiles.find(propertyId, actor);
    if (!profile) return err({ type: 'PropertyNotFound' });

    const [activity, interested, publications] = await Promise.all([
      this.deps.statistics.monthly(propertyId, range),
      this.deps.statistics.interestedCount(profile),
      this.deps.statistics.publications(propertyId, range),
    ]);
    // Todos los meses del período, para el gráfico: los que no tuvieron movimiento van en cero.
    const byMonth = new Map(activity.map((row) => [row.month, row]));
    const last = monthOf(startOfDay(to));
    const calendar: string[] = [];
    for (let month = monthOf(range.from); month <= last; month = shiftMonth(month, 1)) {
      calendar.push(month);
    }
    const monthly = calendar.map((month) => ({
      month,
      emailSends: byMonth.get(month)?.emailSends ?? 0,
      whatsappSends: byMonth.get(month)?.whatsappSends ?? 0,
      inquiries: byMonth.get(month)?.inquiries ?? 0,
    }));
    const sum = (field: 'emailSends' | 'whatsappSends' | 'inquiries') =>
      activity.reduce((total, row) => total + row[field], 0);
    return ok({
      from,
      to,
      publications,
      emailSends: sum('emailSends'),
      whatsappSends: sum('whatsappSends'),
      inquiries: sum('inquiries'),
      interested,
      portalViews: publications.reduce((total, p) => total + p.views, 0),
      portalContacts: publications.reduce((total, p) => total + p.contacts, 0),
      monthly,
    });
  }
}
