import type { SettingsTransaction, SettingsUnitOfWork } from '@norde/core/settings';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import { DrizzleReferenceCodeUsage } from './drizzle-settings-queries';
import {
  DrizzleCompanyFileRepository,
  DrizzleCompanySettingsRepository,
  DrizzleFileFolderRepository,
  DrizzleReferenceCodeSequenceRepository,
} from './drizzle-settings-repositories';

export function createSettingsUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): SettingsUnitOfWork {
  return new DrizzleUnitOfWork<SettingsTransaction>(db, (tx) => ({
    companySettings: new DrizzleCompanySettingsRepository(tx, deps.clock),
    sequences: new DrizzleReferenceCodeSequenceRepository(tx, deps.clock),
    folders: new DrizzleFileFolderRepository(tx, deps.clock),
    files: new DrizzleCompanyFileRepository(tx, deps.clock),
    codeUsage: new DrizzleReferenceCodeUsage(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
