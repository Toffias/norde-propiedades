import type { Result } from '../../../shared';

/** Un usuario de Tokko: uno vigente o el agente de contactos de uno que ya no está. */
export interface TokkoUser {
  readonly tokkoId: string;
  readonly name: string;
  readonly email: string | undefined;
  /** El celular o, si no tiene, el teléfono. */
  readonly phone: string | undefined;
}

/** Tokko no respondió o rechazó la API key. */
export interface TokkoUsersUnavailableError {
  readonly type: 'TokkoUnavailable';
}

/** Los usuarios de la cuenta de Norde en Tokko (`/api/v1/user/`), leídos por infra. */
export interface TokkoUserSource {
  /** Los usuarios vigentes. */
  users(): Promise<Result<readonly TokkoUser[], TokkoUsersUnavailableError>>;
  /**
   * Los agentes de contactos que no están entre `known` (usuarios que ya no están en Tokko): solo
   * se conocen por los contactos que tenían a cargo. Recorre todos los contactos: tarda.
   */
  formerAgents(
    known: ReadonlySet<string>,
  ): Promise<Result<readonly TokkoUser[], TokkoUsersUnavailableError>>;
}
