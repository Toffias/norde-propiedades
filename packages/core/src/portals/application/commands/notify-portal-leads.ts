import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { PortalInputSchema, type PortalInput } from '../../contracts';
import type { PortalLeadsArrived } from '../../domain/listing.events';
import { PORTAL_CATALOG } from '../../domain/portal';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type NotifyPortalLeadsError = ForbiddenError | ValidationFailedError;

/**
 * El portal avisó que llegó un contacto. No se confía en lo que trae el aviso: se pide al job que
 * lea los contactos del portal (`PullPortalLeads`). El evento va por el outbox, así el pedido del
 * portal se contesta enseguida (Zonaprop espera como mucho 1,5 segundos).
 */
export class NotifyPortalLeads {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(input: PortalInput, actor: Actor): Promise<Result<void, NotifyPortalLeadsError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PortalInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;
    if (PORTAL_CATALOG[portal].leadChannel === undefined) {
      return err({ type: 'ValidationFailed', issues: ['Este portal no trae consultas.'] });
    }

    const event: PortalLeadsArrived = {
      type: 'portals.leads_arrived',
      aggregateId: portal,
      occurredAt: this.deps.clock.now(),
      payload: { portal },
    };
    await this.deps.uow.run((tx) => tx.events.publish([event]));
    return ok(undefined);
  }
}
