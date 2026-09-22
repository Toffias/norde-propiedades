import type { ClientsTransaction, ClientsUnitOfWork } from '@norde/core/clients';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import {
  DrizzleClientRepository,
  DrizzleOpportunityRepository,
} from './drizzle-client-repositories';

export function createClientsUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): ClientsUnitOfWork {
  return new DrizzleUnitOfWork<ClientsTransaction>(db, (tx) => ({
    clients: new DrizzleClientRepository(tx),
    opportunities: new DrizzleOpportunityRepository(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
