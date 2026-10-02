import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type {
  ClientRepository,
  ClientTagGroupRepository,
  ClientTagRepository,
  OpportunityRepository,
} from '../../domain/client.repository';

import type { ClientLinkedRecords } from './client-linked-records';

/** Lo que un command de clients usa dentro de la transacción, ligado a la misma conexión. */
export interface ClientsTransaction {
  readonly clients: ClientRepository;
  readonly opportunities: OpportunityRepository;
  readonly tagGroups: ClientTagGroupRepository;
  readonly tags: ClientTagRepository;
  readonly records: ClientLinkedRecords;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type ClientsUnitOfWork = UnitOfWork<ClientsTransaction>;
