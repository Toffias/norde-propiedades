import type { Result } from '../../../shared';
import type { PortalId } from '../../domain/portal';

/** Tokens del portal. El core no los lee: los pasa del autorizador al almacén cifrado. */
export interface PortalCredentials {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: Date;
}

/** A dónde mandar al usuario para autorizar, y lo que hay que guardar hasta que vuelva. */
export interface PortalAuthorizationRequest {
  readonly url: string;
  /** Protege la vuelta contra CSRF: tiene que volver igual. */
  readonly state: string;
  /** Verificador PKCE: se manda al canjear el `code`. */
  readonly codeVerifier: string;
}

export interface PortalAuthorizationGrant {
  readonly credentials: PortalCredentials;
  readonly externalAccountId: string;
  readonly accountName: string;
}

/** Falta configurar la app del portal (client ID, secreto, URL de vuelta). */
export interface PortalNotConfiguredError {
  readonly type: 'PortalNotConfigured';
}

/** El portal rechazó la autorización (código vencido, ya usado o de otra app). */
export interface PortalAuthorizationRejectedError {
  readonly type: 'PortalAuthorizationRejected';
  readonly reason: string;
}

/** El portal no respondió o respondió con un error transitorio. */
export interface PortalUnavailableError {
  readonly type: 'PortalUnavailable';
}

export type PortalAuthorizationError =
  PortalNotConfiguredError | PortalAuthorizationRejectedError | PortalUnavailableError;

/** OAuth con el portal (authorization code + PKCE). */
export interface PortalAuthorizer {
  begin(portal: PortalId): Result<PortalAuthorizationRequest, PortalNotConfiguredError>;
  complete(input: {
    readonly portal: PortalId;
    readonly code: string;
    readonly codeVerifier: string;
  }): Promise<Result<PortalAuthorizationGrant, PortalAuthorizationError>>;
}
