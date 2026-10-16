import { err, type Actor, type ForbiddenError, type Result } from '../../../shared';
import { StartPortalConnectionInputSchema, type StartPortalConnectionInput } from '../../contracts';
import type {
  PortalAuthorizationRequest,
  PortalAuthorizer,
  PortalNotConfiguredError,
} from '../ports/portal-authorizer';
import { requireConnectionMethod, type WrongConnectionMethodError } from '../connection-method';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type StartPortalConnectionError =
  ForbiddenError | ValidationFailedError | WrongConnectionMethodError | PortalNotConfiguredError;

/**
 * Primer paso para conectar una cuenta por OAuth: la URL del portal donde el usuario autoriza a Norde. El
 * `state` y el verificador los guarda el panel hasta la vuelta (`ConnectPortalAccount`).
 */
export class StartPortalConnection {
  constructor(private readonly deps: { readonly authorizer: PortalAuthorizer }) {}

  execute(
    input: StartPortalConnectionInput,
    actor: Actor,
  ): Promise<Result<PortalAuthorizationRequest, StartPortalConnectionError>> {
    return Promise.resolve(this.#start(input, actor));
  }

  #start(
    input: StartPortalConnectionInput,
    actor: Actor,
  ): Result<PortalAuthorizationRequest, StartPortalConnectionError> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(StartPortalConnectionInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;
    const method = requireConnectionMethod(portal, 'oauth');
    if (method.isErr()) return err(method.error);
    return this.deps.authorizer.begin(portal);
  }
}
