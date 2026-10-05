import {
  auditAction,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  SetPortalAccountEnabledInputSchema,
  type SetPortalAccountEnabledInput,
} from '../../contracts';
import type { PortalNotConnectedError } from '../../domain/portal-account';
import { portalAccountTarget } from '../portal-account-audit';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type SetPortalAccountEnabledError =
  ForbiddenError | ValidationFailedError | PortalNotConnectedError;

/** Activa o desactiva una cuenta: solo las activas se ofrecen para publicar. Sin cambios, no audita. */
export class SetPortalAccountEnabled {
  constructor(private readonly deps: { readonly uow: PortalsUnitOfWork }) {}

  async execute(
    input: SetPortalAccountEnabledInput,
    actor: Actor,
  ): Promise<Result<void, SetPortalAccountEnabledError>> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(SetPortalAccountEnabledInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, enabled } = parsed.value;

    return this.deps.uow.run(async (tx): Promise<Result<void, SetPortalAccountEnabledError>> => {
      const account = await tx.accounts.get(portal);
      const before = account.toSnapshot().isEnabled;
      if (before === enabled) return ok(undefined);

      if (enabled) {
        const result = account.enable();
        if (result.isErr()) return err(result.error);
      } else {
        account.disable();
      }

      await tx.accounts.save(account, actor.id);
      await tx.events.publish(account.pullEvents());
      await tx.audit.record(
        auditAction(
          actor,
          portalAccountTarget(
            enabled ? 'portal_account.enabled' : 'portal_account.disabled',
            account,
          ),
          { isEnabled: { before, after: enabled } },
        ),
      );
      return ok(undefined);
    });
  }
}
