import type { CashTransaction, CashUnitOfWork } from '@norde/core/cash';
import type { Clock, IdGenerator } from '@norde/core/shared';

import type { Database } from '../db/client';
import { DrizzleUnitOfWork } from '../db/unit-of-work';
import { DrizzleAuditLog } from '../shared/drizzle-audit-log';

import {
  DrizzleCashClosingRepository,
  DrizzleCashLedger,
  DrizzleCashMovementRepository,
} from './drizzle-cash-repository';

export function createCashUnitOfWork(
  db: Database,
  deps: { readonly ids: IdGenerator; readonly clock: Clock },
): CashUnitOfWork {
  return new DrizzleUnitOfWork<CashTransaction>(db, (tx) => ({
    movements: new DrizzleCashMovementRepository(tx),
    closings: new DrizzleCashClosingRepository(tx),
    ledger: new DrizzleCashLedger(tx),
    audit: new DrizzleAuditLog(tx, deps.ids, deps.clock),
  }));
}
