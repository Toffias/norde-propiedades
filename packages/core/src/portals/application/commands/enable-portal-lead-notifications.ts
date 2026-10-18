import {
  auditAction,
  err,
  ok,
  type Actor,
  type ForbiddenError,
  type Result,
} from '../../../shared';
import { PortalInputSchema, type PortalInput } from '../../contracts';
import { PORTAL_CATALOG } from '../../domain/portal';
import type { PortalNotConnectedError } from '../../domain/portal-account';
import { requireConnectionMethod, type WrongConnectionMethodError } from '../connection-method';
import { portalAccountTarget } from '../portal-account-audit';
import type { PortalNotConfiguredError, PortalUnavailableError } from '../ports/portal-authorizer';
import type { PortalLeadNotifications } from '../ports/portal-leads';
import type { PortalsUnitOfWork } from '../ports/portals-transaction';
import { parseInput, type ValidationFailedError } from '../portals-input';

export type EnablePortalLeadNotificationsError =
  | ForbiddenError
  | ValidationFailedError
  | WrongConnectionMethodError
  | PortalNotConnectedError
  | PortalNotConfiguredError
  | PortalUnavailableError;

/**
 * Le pide al portal que avise a Norde cuando llega un contacto (callbacks), con el header que
 * autoriza el aviso. Sin esto las consultas igual llegan, por la lectura periódica; con esto llegan
 * enseguida. La URL y el valor del header son del servidor (`target`); el valor nunca se audita.
 */
export class EnablePortalLeadNotifications {
  constructor(
    private readonly deps: {
      readonly uow: PortalsUnitOfWork;
      readonly notifications: PortalLeadNotifications;
      /** A dónde avisa el portal y con qué header; sin configurar en el servidor, `undefined`. */
      readonly target:
        | {
            readonly url: string;
            readonly headerName: string;
            readonly headerValue: string;
          }
        | undefined;
    },
  ) {}

  async execute(
    input: PortalInput,
    actor: Actor,
  ): Promise<Result<void, EnablePortalLeadNotificationsError>> {
    if (!actor.can('portals:manage')) return err({ type: 'Forbidden' });
    const parsed = parseInput(PortalInputSchema, input);
    if (parsed.isErr()) return err(parsed.error);
    const { portal } = parsed.value;
    if (PORTAL_CATALOG[portal].leadChannel === undefined) {
      return err({ type: 'ValidationFailed', issues: ['Este portal no trae consultas.'] });
    }
    // Los avisos de MercadoLibre se configuran en su app, no por la API.
    const method = requireConnectionMethod(portal, 'account_code');
    if (method.isErr()) return err(method.error);
    const { target } = this.deps;
    if (target === undefined) return err({ type: 'PortalNotConfigured' });

    const account = await this.deps.uow.run((tx) => tx.accounts.get(portal));
    if (!account.isConnected) return err({ type: 'PortalNotConnected' });

    const subscribed = await this.deps.notifications.subscribe({ portal, ...target });
    if (subscribed.isErr()) return err(subscribed.error);

    await this.deps.uow.run((tx) =>
      tx.audit.record(
        auditAction(
          actor,
          portalAccountTarget('portal_account.lead_notifications_enabled', account),
          {
            notifications: { before: null, after: { url: target.url, header: target.headerName } },
          },
        ),
      ),
    );
    return ok(undefined);
  }
}
