import type { Email } from '../../shared/domain/value-objects/email';
import type { Phone } from '../../shared/domain/value-objects/phone';

import type { Client, ClientId } from './client';
import type { Opportunity, OpportunityId } from './opportunity';

export interface ClientRepository {
  findById(id: ClientId): Promise<Client | undefined>;
  /** Busca por `Phone.matchKey`: encuentra el mismo celular con o sin el 9. */
  findByPhone(phone: Phone): Promise<Client | undefined>;
  findByEmail(email: Email): Promise<Client | undefined>;
  save(client: Client): Promise<void>;
}

export interface OpportunityRepository {
  findById(id: OpportunityId): Promise<Opportunity | undefined>;
  findOpenByClient(clientId: ClientId): Promise<Opportunity[]>;
  save(opportunity: Opportunity): Promise<void>;
}
