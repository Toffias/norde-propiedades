import type { PortalsTransaction, PortalsUnitOfWork } from '@norde/core/portals';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { SecretCipher } from '../adapters/crypto/aes-gcm-secret-cipher';
import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import {
  DrizzlePortalAccountRepository,
  DrizzlePortalCredentialStore,
} from './drizzle-portal-accounts';
import { DrizzleListingRepository } from './drizzle-listing-repository';

export function createPortalsUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock; readonly cipher: SecretCipher },
): PortalsUnitOfWork {
  return new DrizzleUnitOfWork<PortalsTransaction>(db, (tx) => ({
    accounts: new DrizzlePortalAccountRepository(tx, deps.clock),
    credentials: new DrizzlePortalCredentialStore(tx, deps.cipher),
    listings: new DrizzleListingRepository(tx, deps.clock),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
