import type { ClientsTransaction, ClientsUnitOfWork } from '@norde/core/clients';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleDevelopmentChances } from '../properties/drizzle-development-chances';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleIdempotencyKeys } from '../shared/drizzle-idempotency-keys';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import {
  DrizzleClientActivityRepository,
  DrizzleFeaturedListingRepository,
} from './drizzle-client-activity-repositories';
import { DrizzleClientErasure } from './drizzle-client-erasure';
import { DrizzleClientExternalIds } from './drizzle-client-external-ids';
import { DrizzleClientImportRepository } from './drizzle-client-imports';
import { DrizzleFollowUpMatchRepository } from './drizzle-follow-up-repositories';
import { DrizzleClientLinkedRecords } from './drizzle-client-linked-records';
import { DrizzleInquiryRepository } from './drizzle-inquiry-repository';
import { DrizzleInquiryRuleRepository } from './drizzle-inquiry-rule-repository';
import { DrizzleQuickReplyRepository } from './drizzle-quick-reply-repository';
import { DrizzleOpportunityBulkOperationRepository } from './drizzle-opportunity-bulk-operations';
import { DrizzleSavedSearchRepository } from './drizzle-saved-search-repository';
import { DrizzleSharedListingRepository } from './drizzle-shared-listing-repository';
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
    followUpMatches: new DrizzleFollowUpMatchRepository(tx),
    savedSearches: new DrizzleSavedSearchRepository(tx),
    sharedListings: new DrizzleSharedListingRepository(tx),
    erasure: new DrizzleClientErasure(tx),
    imports: new DrizzleClientImportRepository(tx, deps.ids),
    externalIds: new DrizzleClientExternalIds(tx, deps.ids),
    bulkOperations: new DrizzleOpportunityBulkOperationRepository(tx),
    inquiries: new DrizzleInquiryRepository(tx),
    inquiryRules: new DrizzleInquiryRuleRepository(tx),
    quickReplies: new DrizzleQuickReplyRepository(tx),
    developmentChances: new DrizzleDevelopmentChances(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
    idempotency: new DrizzleIdempotencyKeys(tx, deps.clock),
  }));
}
