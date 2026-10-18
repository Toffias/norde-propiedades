import { err, ok, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { PortalInputSchema, type PortalInput, type PortalPackageView } from '../../contracts';
import type { PortalNotConnectedError } from '../../domain/portal-account';
import type { PortalAccountRepository } from '../../domain/portals.repository';
import { requireConnectionMethod, type WrongConnectionMethodError } from '../connection-method';
import type { PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalCredentialsMissingError } from '../ports/portal-connector';
import type { PortalPackageReader } from '../ports/portal-packages';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type GetPortalPackagesError =
  | ForbiddenError
  | ValidationFailedError
  | WrongConnectionMethodError
  | PortalNotConnectedError
  | PortalUnavailableError
  | PortalCredentialsMissingError;

/**
 * Los paquetes de publicación activos de una cuenta conectada por OAuth (MercadoLibre), con el cupo
 * que le queda a cada tipo de aviso. Se leen del portal en el momento: no se guardan. Los ve quien
 * conecta o quien publica.
 */
export class GetPortalPackages {
  constructor(
    private readonly deps: {
      readonly accounts: PortalAccountRepository;
      readonly reader: PortalPackageReader;
    },
  ) {}

  async execute(
    input: PortalInput,
    actor: Actor,
  ): Promise<Result<readonly PortalPackageView[], GetPortalPackagesError>> {
    if (!actor.can('portals:manage') && !actor.can('portals:publish')) {
      return err({ type: 'Forbidden' });
    }
    const parsed = parseInput(PortalInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;
    const method = requireConnectionMethod(portal, 'oauth');
    if (method.isErr()) return err(method.error);

    const connection = (await this.deps.accounts.get(portal)).toSnapshot().connection;
    if (!connection) return err({ type: 'PortalNotConnected' });

    const packages = await this.deps.reader.packages({
      portal,
      externalAccountId: connection.externalAccountId,
    });
    if (packages.isErr()) return err(packages.error);
    return ok(
      packages.value.map(({ id, name, content, expiresAt, quotas }) => ({
        id,
        name,
        content,
        expiresAt,
        quotas: quotas.map(({ tier, total, used, remaining }) => ({
          tier,
          total,
          used,
          remaining,
        })),
      })),
    );
  }
}
