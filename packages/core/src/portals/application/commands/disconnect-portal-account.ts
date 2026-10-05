import {
  auditAction,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { PortalInputSchema, type PortalInput } from '../../contracts';
import type { PortalNotConnectedError } from '../../domain/portal-account';
import { connectionAuditValue, portalAccountTarget } from '../portal-account-audit';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type DisconnectPortalAccountError =
  ForbiddenError | ValidationFailedError | PortalNotConnectedError;

/** Desvincula la cuenta del portal y borra sus credenciales. La cuenta queda desactivada. */
export class DisconnectPortalAccount {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork }) {}

  async execute(
    input: PortalInput,
    actor: Actor,
  ): Promise<Result<void, DisconnectPortalAccountError>> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PortalInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;

    return this.deps.uow.run(async (tx): Promise<Result<void, DisconnectPortalAccountError>> => {
      const account = await tx.accounts.get(portal);
      const before = connectionAuditValue(account);
      const disconnected = account.disconnect();
      if (disconnected.isErr()) return err(disconnected.error);

      await tx.accounts.save(account, actor.id);
      await tx.credentials.delete(portal);
      await tx.events.publish(account.pullEvents());
      await tx.audit.record(
        auditAction(actor, portalAccountTarget('portal_account.disconnected', account), {
          account: { before, after: null },
        }),
      );
      return ok(undefined);
    });
  }
}
