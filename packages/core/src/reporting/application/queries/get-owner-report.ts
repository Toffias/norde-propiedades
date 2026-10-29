import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  MAX_OWNER_REPORT_DAYS,
  OwnerReportQuerySchema,
  type OwnerReport,
  type OwnerReportActivity,
  type OwnerReportInput,
} from '../../contracts';
import { dayOf, endOfDay, monthOf, shiftDay, shiftMonth, startOfDay } from '../months';
import type { ReportingPropertyProfiles } from '../ports/property-profiles';
import type { PropertyStatisticsQuery } from '../ports/property-statistics-query';

export type GetOwnerReportError =
  | ForbiddenError
  | { readonly type: 'InvalidInput'; readonly issues: readonly string[] }
  | { readonly type: 'PropertyNotFound' }
  | { readonly type: 'ReportPeriodTooLong'; readonly maxDays: number };

const DAY_MS = 24 * 60 * 60 * 1000;

type MonthlyRow = Awaited<ReturnType<PropertyStatisticsQuery['monthly']>>[number];

function totals(rows: readonly MonthlyRow[]): OwnerReportActivity {
  const sum = (field: keyof OwnerReportActivity) =>
    rows.reduce((total, row) => total + row[field], 0);
  return {
    emailSends: sum('emailSends'),
    whatsappSends: sum('whatsappSends'),
    inquiries: sum('inquiries'),
  };
}

/**
 * El reporte al propietario de un período: dónde está publicada, cuánto la vieron en cada portal,
 * cuántas veces se envió y cuántas consultas recibió. Para comparar, también los últimos 15 y 30
 * días y desde el alta, hasta el fin del período. Sin datos de los clientes.
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
    // El día del alta en Buenos Aires; si falta o es posterior al período, el inicio del período.
    const listed = parsed.data.since === undefined ? undefined : dayOf(parsed.data.since);
    const since = listed !== undefined && listed <= to ? listed : from;
    const range = { from: startOfDay(from), to: endOfDay(to) };
    if ((range.to.getTime() - range.from.getTime()) / DAY_MS > MAX_OWNER_REPORT_DAYS) {
      return err({ type: 'ReportPeriodTooLong', maxDays: MAX_OWNER_REPORT_DAYS });
    }
    const profile = await this.deps.profiles.find(propertyId, actor);
    if (!profile) return err({ type: 'PropertyNotFound' });

    const window = (start: string) =>
      this.deps.statistics.monthly(propertyId, { from: startOfDay(start), to: range.to });
    const [activity, interested, publications, last15, last30, sinceCreation] = await Promise.all([
      this.deps.statistics.monthly(propertyId, range),
      this.deps.statistics.interestedCount(profile),
      this.deps.statistics.publications(propertyId, range),
      window(shiftDay(to, -14)),
      window(shiftDay(to, -29)),
      window(since),
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
    return ok({
      from,
      to,
      publications,
      ...totals(activity),
      interested,
      portalViews: publications.reduce((total, p) => total + p.views, 0),
      portalContacts: publications.reduce((total, p) => total + p.contacts, 0),
      monthly,
      windows: {
        last15Days: totals(last15),
        last30Days: totals(last30),
        sinceCreation: { ...totals(sinceCreation), from: since },
      },
    });
  }
}
