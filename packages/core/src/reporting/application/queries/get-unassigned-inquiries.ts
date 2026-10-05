import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import {
  HOME_WIDGET_LIMIT,
  type HomeFilter,
  type HomeWidget,
  type UnassignedInquiryRow,
} from '../../contracts';
import { invalidInput, parseHomeFilter, type InvalidInputError } from '../home-support';
import type { HomeDashboardQuery } from '../ports/home-dashboard-query';

export type GetUnassignedInquiriesError = ForbiddenError | InvalidInputError;

/**
 * Inicio, "Consultas sin asignar": las más viejas primero, con su antigüedad. Una consulta sin
 * asignar no tiene agente: se ven todas (como en la bandeja) y el filtro de sucursal las achica.
 */
export class GetUnassignedInquiries {
  constructor(private readonly deps: { readonly home: HomeDashboardQuery }) {}

  async execute(
    input: HomeFilter,
    actor: Actor,
  ): Promise<Result<HomeWidget<UnassignedInquiryRow>, GetUnassignedInquiriesError>> {
    if (!actor.can('inquiries:read')) return err({ type: 'Forbidden' });
    const parsed = parseHomeFilter(input);
    if (!parsed.success) return err(invalidInput(parsed.error));
    const slice = await this.deps.home.unassignedInquiries(
      { branchId: parsed.data.branchId },
      HOME_WIDGET_LIMIT,
    );
    return ok(slice);
  }
}
