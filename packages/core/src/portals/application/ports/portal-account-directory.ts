import type { Result } from '../../../shared';
import type { ListingOwnerKind, PortalId } from '../../domain/portal';
import type { PortalNotConfiguredError, PortalUnavailableError } from './portal-authorizer';

/** La cuenta que el portal encontró con ese código. */
export interface PortalAccountMatch {
  readonly externalAccountId: string;
  readonly accountName: string;
}

/** El portal no tiene una cuenta con ese código habilitada para Norde como integrador. */
export interface PortalAccountNotFoundError {
  readonly type: 'PortalAccountNotFound';
}

/** El portal bloqueó la cuenta (en Zonaprop, por una deuda): hay que regularizarla con el portal. */
export interface PortalAccountBlockedError {
  readonly type: 'PortalAccountBlocked';
}

export type PortalAccountLookupError =
  | PortalNotConfiguredError
  | PortalAccountNotFoundError
  | PortalAccountBlockedError
  | PortalUnavailableError;

/** Lo disponible de un plan de publicación contratado. */
export interface PortalCredit {
  /** El código del plan en el portal (en Zonaprop, `planDePublicacion`). */
  readonly plan: string;
  readonly available: number;
  /** Lo contratado, si el portal lo informa. */
  readonly contracted: number | undefined;
  /** Para qué sirve el plan: avisos de propiedades o de emprendimientos. */
  readonly publishes: ListingOwnerKind;
}

/**
 * Cuentas de un portal donde Norde es integrador (conexión por código, sin OAuth). Las credenciales
 * de integrador son de Norde, no de la cuenta: las tiene infra.
 */
export interface PortalAccountDirectory {
  /** Busca la cuenta con ese código entre las habilitadas para Norde. */
  find(input: {
    readonly portal: PortalId;
    readonly accountCode: string;
  }): Promise<Result<PortalAccountMatch, PortalAccountLookupError>>;

  /** Los créditos de publicación que le quedan a la cuenta, por plan. */
  credits(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
  }): Promise<Result<readonly PortalCredit[], PortalNotConfiguredError | PortalUnavailableError>>;
}
