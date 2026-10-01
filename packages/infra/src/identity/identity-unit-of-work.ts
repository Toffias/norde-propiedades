import type { IdentityTransaction, IdentityUnitOfWork } from '@norde/core/identity';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';
import { DrizzleOutboxPublisher } from '../shared/drizzle-outbox-publisher';

import { DrizzleCredentialStore, DrizzleUserSessions } from './drizzle-identity-ports';
import {
  DrizzleBranchRepository,
  DrizzleTeamRepository,
} from './drizzle-organization-repositories';
import { DrizzleRoleRepository } from './drizzle-role-repository';
import { DrizzleUserRepository } from './drizzle-user-repository';

export function createIdentityUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): IdentityUnitOfWork {
  return new DrizzleUnitOfWork<IdentityTransaction>(db, (tx) => ({
    users: new DrizzleUserRepository(tx),
    roles: new DrizzleRoleRepository(tx),
    branches: new DrizzleBranchRepository(tx),
    teams: new DrizzleTeamRepository(tx),
    credentials: new DrizzleCredentialStore(tx, deps.ids, deps.clock),
    sessions: new DrizzleUserSessions(tx),
    events: new DrizzleOutboxPublisher(tx, deps.ids, deps.clock),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
