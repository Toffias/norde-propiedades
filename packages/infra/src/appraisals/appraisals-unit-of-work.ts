import {
  MAX_APPRAISAL_PHOTOS,
  type AppraisalsTransaction,
  type AppraisalsUnitOfWork,
} from '@norde/core/appraisals';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import {
  DrizzleAppraisalCodeSequence,
  DrizzleAppraisalPhotoRepository,
  DrizzleAppraisalRepository,
} from './drizzle-appraisal-repository';

export function createAppraisalsUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): AppraisalsUnitOfWork {
  return new DrizzleUnitOfWork<AppraisalsTransaction>(db, (tx) => ({
    appraisals: new DrizzleAppraisalRepository(tx),
    photos: new DrizzleAppraisalPhotoRepository(tx, MAX_APPRAISAL_PHOTOS),
    codes: new DrizzleAppraisalCodeSequence(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
