import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type { ClientRepository, OpportunityRepository } from '../../domain/client.repository';

/** Lo que un command de clients usa dentro de la transacción, ligado a la misma conexión. */
export interface ClientsTransaction {
  readonly clients: ClientRepository;
  readonly opportunities: OpportunityRepository;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type ClientsUnitOfWork = UnitOfWork<ClientsTransaction>;
