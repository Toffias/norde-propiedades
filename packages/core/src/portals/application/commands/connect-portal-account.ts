import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { ConnectPortalAccountInputSchema, type ConnectPortalAccountInput } from '../../contracts';
import type { PortalAccountInUseError } from '../../domain/portal-account';
import { connectionAuditValue, portalAccountTarget } from '../portal-account-audit';
import type { PortalAuthorizationError, PortalAuthorizer } from '../ports/portal-authorizer';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

/** El `state` que volvió del portal no es el que se guardó al empezar (CSRF o pestaña vieja). */
export interface InvalidAuthorizationStateError {
  readonly type: 'InvalidAuthorizationState';
}

export type ConnectPortalAccountError =
  | ForbiddenError
  | ValidationFailedError
  | InvalidAuthorizationStateError
  | PortalAuthorizationError
  | PortalAccountInUseError;

/**
 * Vuelta del portal después de autorizar: canjea el código por los tokens, vincula la cuenta y
 * guarda las credenciales cifradas. El canje va antes de la transacción: es una llamada externa.
 */
export class ConnectPortalAccount {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly authorizer: PortalAuthorizer;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ConnectPortalAccountInput,
    actor: Actor,
  ): Promise<Result<{ readonly accountName: string }, ConnectPortalAccountError>> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ConnectPortalAccountInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, code, state, expectedState, codeVerifier } = parsed.value;
    if (state !== expectedState) return err({ type: 'InvalidAuthorizationState' });

    const grant = await this.deps.authorizer.complete({ portal, code, codeVerifier });
    if (grant.isErr()) return err(grant.error);
    const { credentials, externalAccountId, accountName } = grant.value;

    return this.deps.uow.run(
      async (tx): Promise<Result<{ readonly accountName: string }, ConnectPortalAccountError>> => {
        const account = await tx.accounts.get(portal);
        const before = connectionAuditValue(account);
        const connected = account.connect(
          {
            externalAccountId,
            accountName,
            connectedAt: this.deps.clock.now(),
            connectedBy: actor.id,
          },
          await tx.accounts.all(),
        );
        if (connected.isErr()) return err(connected.error);

        await tx.accounts.save(account, actor.id);
        await tx.credentials.save(portal, credentials);
        await tx.events.publish(account.pullEvents());
        await tx.audit.record(
          auditAction(actor, portalAccountTarget('portal_account.connected', account), {
            account: { before, after: connectionAuditValue(account) },
          }),
        );
        return ok({ accountName });
      },
    );
  }
}
