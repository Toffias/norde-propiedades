import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type {
  ClientActivityRepository,
  ClientImportRepository,
  ClientRepository,
  ClientTagGroupRepository,
  ClientTagRepository,
  FeaturedListingRepository,
  InquiryRepository,
  InquiryRuleRepository,
  OpportunityBulkOperationRepository,
  OpportunityCloseReasonRepository,
  OpportunityRepository,
  OpportunitySettingsRepository,
  OpportunityStageRepository,
  SavedSearchRepository,
} from '../../domain/client.repository';

import type { ClientErasure } from './client-erasure';
import type { ClientLinkedRecords } from './client-linked-records';

/** Lo que un command de clients usa dentro de la transacción, ligado a la misma conexión. */
export interface ClientsTransaction {
  readonly clients: ClientRepository;
  readonly opportunities: OpportunityRepository;
  readonly stages: OpportunityStageRepository;
  readonly closeReasons: OpportunityCloseReasonRepository;
  readonly opportunitySettings: OpportunitySettingsRepository;
  readonly tagGroups: ClientTagGroupRepository;
  readonly tags: ClientTagRepository;
  readonly records: ClientLinkedRecords;
  readonly activities: ClientActivityRepository;
  readonly featured: FeaturedListingRepository;
  readonly savedSearches: SavedSearchRepository;
  readonly erasure: ClientErasure;
  readonly imports: ClientImportRepository;
  readonly bulkOperations: OpportunityBulkOperationRepository;
  readonly inquiries: InquiryRepository;
  readonly inquiryRules: InquiryRuleRepository;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type ClientsUnitOfWork = UnitOfWork<ClientsTransaction>;
