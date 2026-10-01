import type { PropertiesTransaction, PropertiesUnitOfWork } from '@norde/core/properties';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import {
  DrizzleFavoriteSearchRepository,
  DrizzleFeatureRepository,
  DrizzleLocationRepository,
  DrizzlePropertySettingsRepository,
  DrizzlePropertyTypeSettingsRepository,
  DrizzleTagGroupRepository,
  DrizzleTagRepository,
} from './drizzle-catalog-repositories';
import { DrizzlePropertyRepository } from './drizzle-property-repository';

export function createPropertiesUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): PropertiesUnitOfWork {
  return new DrizzleUnitOfWork<PropertiesTransaction>(db, (tx) => ({
    properties: new DrizzlePropertyRepository(tx, deps.ids),
    locations: new DrizzleLocationRepository(tx),
    features: new DrizzleFeatureRepository(tx),
    tagGroups: new DrizzleTagGroupRepository(tx),
    tags: new DrizzleTagRepository(tx),
    typeSettings: new DrizzlePropertyTypeSettingsRepository(tx),
    settings: new DrizzlePropertySettingsRepository(tx),
    favoriteSearches: new DrizzleFavoriteSearchRepository(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
