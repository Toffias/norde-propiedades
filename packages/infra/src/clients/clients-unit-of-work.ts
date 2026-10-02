import type { ClientsTransaction, ClientsUnitOfWork } from '@norde/core/clients';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import {
  DrizzleClientActivityRepository,
  DrizzleFeaturedListingRepository,
} from './drizzle-client-activity-repositories';
import { DrizzleClientErasure } from './drizzle-client-erasure';
import { DrizzleClientImportRepository } from './drizzle-client-imports';
import { DrizzleClientLinkedRecords } from './drizzle-client-linked-records';
import { DrizzleOpportunityBulkOperationRepository } from './drizzle-opportunity-bulk-operations';
import {
  DrizzleClientRepository,
  DrizzleOpportunityRepository,
} from './drizzle-client-repositories';
import {
  DrizzleOpportunityCloseReasonRepository,
  DrizzleOpportunitySettingsRepository,
  DrizzleOpportunityStageRepository,
} from './drizzle-opportunity-config-repositories';
import {
  DrizzleClientTagGroupRepository,
  DrizzleClientTagRepository,
} from './drizzle-client-tag-repositories';

export function createClientsUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): ClientsUnitOfWork {
  return new DrizzleUnitOfWork<ClientsTransaction>(db, (tx) => ({
    clients: new DrizzleClientRepository(tx, deps.ids),
    opportunities: new DrizzleOpportunityRepository(tx),
    stages: new DrizzleOpportunityStageRepository(tx),
    closeReasons: new DrizzleOpportunityCloseReasonRepository(tx),
    opportunitySettings: new DrizzleOpportunitySettingsRepository(tx),
    tagGroups: new DrizzleClientTagGroupRepository(tx),
    tags: new DrizzleClientTagRepository(tx),
    records: new DrizzleClientLinkedRecords(tx),
    activities: new DrizzleClientActivityRepository(tx),
    featured: new DrizzleFeaturedListingRepository(tx),
    erasure: new DrizzleClientErasure(tx),
    imports: new DrizzleClientImportRepository(tx, deps.ids),
    bulkOperations: new DrizzleOpportunityBulkOperationRepository(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
