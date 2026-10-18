import { err, ok, type Actor, type Clock, type ForbiddenError, type Result } from '../../../shared';
import { PortalAccountNoticeInputSchema, type PortalAccountNoticeInput } from '../../contracts';
import type { PortalLeadsArrived } from '../../domain/listing.events';
import { PORTAL_CATALOG, type PortalId } from '../../domain/portal';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type NotifyAccountLeadsError = ForbiddenError | ValidationFailedError;

/**
 * El portal avisó que llegó un contacto a una de sus cuentas, identificada por su ID en el portal
 * (MercadoLibre avisa con el `user_id`, y Norde tiene dos cuentas). Si es una cuenta conectada que
 * trae consultas, pide leerlas (`portals.leads_arrived`, como `NotifyPortalLeads`). Si no, el aviso
 * no es de Norde y se ignora: devuelve el portal, o `undefined`.
 */
export class NotifyAccountLeads {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork; readonly clock: Clock }) {}

  async execute(
    input: PortalAccountNoticeInput,
    actor: Actor,
  ): Promise<Result<{ readonly portal: PortalId | undefined }, NotifyAccountLeadsError>> {
    if (!actor.can('portals:sync')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PortalAccountNoticeInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { provider, externalAccountId } = parsed.value;

    return this.deps.uow.run(async (tx) => {
      const account = (await tx.accounts.all()).find((candidate) => {
        const definition = PORTAL_CATALOG[candidate.portal];
        return (
          definition.provider === provider &&
          definition.leadChannel !== undefined &&
          candidate.toSnapshot().connection?.externalAccountId === externalAccountId
        );
      });
      if (!account) return ok({ portal: undefined });

      const event: PortalLeadsArrived = {
        type: 'portals.leads_arrived',
        aggregateId: account.portal,
        occurredAt: this.deps.clock.now(),
        payload: { portal: account.portal },
      };
      await tx.events.publish([event]);
      return ok({ portal: account.portal });
    });
  }
}
