import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { PortalInputSchema, type PortalCreditView, type PortalInput } from '../../contracts';
import type { PortalNotConnectedError } from '../../domain/portal-account';
import type { PortalAccountRepository } from '../../domain/portals.repository';
import { requireConnectionMethod, type WrongConnectionMethodError } from '../connection-method';
import type { PortalAccountDirectory } from '../ports/portal-account-directory';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type GetPortalCreditsError =
  | ForbiddenError
  | ValidationFailedError
  | WrongConnectionMethodError
  | PortalNotConnectedError
  | PortalNotConfiguredError
  | PortalUnavailableError;

/**
 * Los créditos de publicación que le quedan a una cuenta conectada por código (Zonaprop), por plan.
 * Se leen del portal en el momento: no se guardan. Los ve quien conecta o quien publica.
 */
export class GetPortalCredits {
  constructor(
    private readonly deps: {
      readonly accounts: PortalAccountRepository;
      readonly directory: PortalAccountDirectory;
    },
  ) {}

  async execute(
    input: PortalInput,
    actor: Actor,
  ): Promise<Result<readonly PortalCreditView[], GetPortalCreditsError>> {
    if (!actor.can('portals:manage') && !actor.can('portals:publish')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = parseInput(PortalInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;
    const method = requireConnectionMethod(portal, 'account_code');
    if (method.isErr()) return err(method.error);

    const connection = (await this.deps.accounts.get(portal)).toSnapshot().connection;
    if (!connection) return err({ type: 'PortalNotConnected' });

    const credits = await this.deps.directory.credits({
      portal,
      externalAccountId: connection.externalAccountId,
    });
    if (credits.isErr()) return err(credits.error);
    return ok(
      credits.value.map(({ plan, available, contracted, publishes }) => ({
        plan,
        available,
        contracted,
        publishes,
      })),
    );
  }
}
