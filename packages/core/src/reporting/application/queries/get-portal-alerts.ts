import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { HOME_WIDGET_LIMIT, type HomeWidget, type PortalAlertRow } from '../../contracts';
import { portalAlertUrgency, worstUrgency } from '../../domain/urgency';
import type { HomeDashboardQuery } from '../ports/home-dashboard-query';

export type GetPortalAlertsError = ForbiddenError;

/**
 * Inicio, "Avisos con problemas": las publicaciones pausadas o con error en los portales, para
 * corregirlas desde su ficha. Las ve quien publica o administra los portales.
 */
export class GetPortalAlerts {
  constructor(private readonly deps: { readonly home: HomeDashboardQuery }) {}

  async execute(
    _input: Record<string, never>,
    actor: Actor,
  ): Promise<Result<HomeWidget<PortalAlertRow>, GetPortalAlertsError>> {
    if (!actor.can('portals:publish') && !actor.can('portals:manage')) {
      return err({ type: 'Forbidden' });
    }
    const slice = await this.deps.home.portalAlerts(HOME_WIDGET_LIMIT);
    const items = slice.items.map((row) => ({ ...row, urgency: portalAlertUrgency(row.status) }));
    return ok({
      total: slice.total,
      items,
      urgency: worstUrgency(items.map((row) => row.urgency)),
    });
  }
}
