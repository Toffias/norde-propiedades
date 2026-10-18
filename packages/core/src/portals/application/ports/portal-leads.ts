import type { PageSlice, Result } from '../../../shared';
import type { PortalId, PortalLeadChannel } from '../../domain/portal';
import type { PortalLead } from '../../domain/portal-lead';
import type { PortalNotConfiguredError, PortalUnavailableError } from './portal-authorizer';

/** Los contactos que llegaron por los avisos de la cuenta en el portal. */
export interface PortalLeadSource {
  /** Una página de los contactos desde `since`, del más viejo al más nuevo. */
  recent(input: {
    readonly portal: PortalId;
    readonly externalAccountId: string;
    readonly since: Date;
    readonly offset: number;
    readonly limit: number;
  }): Promise<Result<PageSlice<PortalLead>, PortalNotConfiguredError | PortalUnavailableError>>;
}

/** La bandeja rechazó la consulta (teléfono o email inválidos, sin datos de contacto). */
export interface PortalLeadRejected {
  readonly type: 'PortalLeadRejected';
  readonly reason: string;
}

/**
 * La bandeja de consultas (módulo clients): recibe una consulta del portal. Repetir el mismo
 * `externalId` no la duplica. La implementa el panel con `ReceiveInquiry`.
 */
export interface PortalLeadSink {
  receive(input: {
    readonly channel: PortalLeadChannel;
    readonly externalId: string;
    readonly receivedAt: Date | undefined;
    readonly name: string | undefined;
    readonly email: string | undefined;
    readonly phone: string | undefined;
    readonly message: string;
    readonly propertyId: string | undefined;
    readonly developmentId: string | undefined;
  }): Promise<Result<{ readonly duplicate: boolean }, PortalLeadRejected>>;
}

/**
 * Los avisos del portal cuando llega un contacto (callbacks): a qué URL, con qué header de
 * autorización y para qué eventos.
 */
export interface PortalLeadNotifications {
  subscribe(input: {
    readonly portal: PortalId;
    readonly url: string;
    readonly headerName: string;
    readonly headerValue: string;
  }): Promise<Result<void, PortalNotConfiguredError | PortalUnavailableError>>;
}
