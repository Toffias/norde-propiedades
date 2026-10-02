import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import type { OpportunityConfiguration } from '../../contracts';
import type { ClientsUnitOfWork } from '../ports/clients-transaction';

/**
 * Estados, motivos de cierre y reglas automáticas. Los dos catálogos tienen tope en el dominio
 * (`MAX_OPPORTUNITY_STAGES`, `MAX_CLOSE_REASONS`): se devuelven completos, por posición. Los usan
 * Mi empresa y el pipeline (secciones, columnas, diálogo de cierre).
 */
export class GetOpportunityConfiguration {
  constructor(private readonly deps: { readonly uow: ClientsUnitOfWork }) {}

  async execute(actor: Actor): Promise<Result<OpportunityConfiguration, ForbiddenError>> {
    if (!actor.can('settings:read') && !actor.can('opportunities:read')) {
      return err({ type: 'Forbidden' });
    }

    return this.deps.uow.run(async (tx) => {
      const [stages, reasons, rules] = await Promise.all([
        tx.stages.findAll(),
        tx.closeReasons.findAll(),
        tx.opportunitySettings.get(),
      ]);
      return ok({
        stages: stages.map((stage) => {
          const { id, name, color, position, category, isActive } = stage.toSnapshot();
          return { id, name, color, position, category, isActive };
        }),
        closeReasons: reasons.map((reason) => {
          const { id, name, rating, position, isActive } = reason.toSnapshot();
          return { id, name, rating, position, isActive };
        }),
        rules: {
          onCreate: rules.onCreate ?? null,
          onAssign: rules.onAssign ?? null,
          onReactivate: rules.onReactivate ?? null,
          forOwners: rules.forOwners ?? null,
        },
      });
    });
  }
}
