import {
  auditAction,
  err,
  ok,
  type Actor,
  type Clock,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import {
  ConnectPortalAccountWithCodeInputSchema,
  type ConnectPortalAccountWithCodeInput,
} from '../../contracts';
import type { PortalAccountInUseError } from '../../domain/portal-account';
import { requireConnectionMethod, type WrongConnectionMethodError } from '../connection-method';
import { connectionAuditValue, portalAccountTarget } from '../portal-account-audit';
import type {
  PortalAccountDirectory,
  PortalAccountLookupError,
} from '../ports/portal-account-directory';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type ConnectPortalAccountWithCodeError =
  | ForbiddenError
  | ValidationFailedError
  | WrongConnectionMethodError
  | PortalAccountLookupError
  | PortalAccountInUseError;

/**
 * Vincula la cuenta de un portal donde Norde ya es integrador, por el código de la cuenta (en
 * Zonaprop, el código de inmobiliaria). El portal confirma que la cuenta existe y está habilitada
 * para Norde; no hay tokens por cuenta. La consulta va antes de la transacción: es externa.
 */
export class ConnectPortalAccountWithCode {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly directory: PortalAccountDirectory;
      readonly clock: Clock;
    },
  ) {}

  async execute(
    input: ConnectPortalAccountWithCodeInput,
    actor: Actor,
  ): Promise<Result<{ readonly accountName: string }, ConnectPortalAccountWithCodeError>> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(ConnectPortalAccountWithCodeInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal, accountCode } = parsed.value;
    const method = requireConnectionMethod(portal, 'account_code');
    if (method.isErr()) return err(method.error);

    const match = await this.deps.directory.find({ portal, accountCode });
    if (match.isErr()) return err(match.error);
    const { externalAccountId, accountName } = match.value;

    return this.deps.uow.run(
      async (
        tx,
      ): Promise<Result<{ readonly accountName: string }, ConnectPortalAccountWithCodeError>> => {
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
