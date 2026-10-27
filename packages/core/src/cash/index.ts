// API pública del módulo cash (`@norde/core/cash`): la caja chica de la oficina (#164).

export * from './contracts';
export { CASH_BOXES, CASH_CURRENCY, type CashBox, type CashCurrency } from './domain/cash-box';
export {
  buenosAiresDate,
  currentCashPeriod,
  isCashDate,
  isCashPeriod,
  nextCashPeriod,
  periodOf,
  type CashPeriod,
} from './domain/cash-period';
export {
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_STATUSES,
  CashMovement,
  MAX_CASH_AMOUNT_CENTS,
  MAX_CASH_CONCEPT_LENGTH,
  MAX_CASH_NOTES_LENGTH,
  type CashMovementDetails,
  type CashMovementId,
  type CashMovementInactiveError,
  type CashMovementKind,
  type CashMovementSnapshot,
  type CashMovementStatus,
  type InvalidCashMovementError,
} from './domain/cash-movement';
export {
  CashClosing,
  closingBalance,
  type CashClosingId,
  type CashClosingSnapshot,
  type CashTotals,
} from './domain/cash-closing';
export { checkCashPeriodOpen, type CashPeriodClosedError } from './domain/cash-period-access';
export type {
  CashClosingRepository,
  CashLedger,
  CashMovementRepository,
} from './domain/cash.repository';

export type { CashTransaction, CashUnitOfWork } from './application/ports/cash-transaction';
export type {
  CashMovementListItem,
  CashQuery,
  CashUserNames,
} from './application/ports/cash-query';
export type { CashMovementNotFoundError, InvalidInputError } from './application/cash-support';

export {
  RecordCashMovement,
  type RecordCashMovementError,
} from './application/commands/record-cash-movement';
export {
  UpdateCashMovement,
  type UpdateCashMovementError,
} from './application/commands/update-cash-movement';
export {
  VoidLastCashMovement,
  type NotLastCashMovementError,
  type VoidLastCashMovementError,
} from './application/commands/void-last-cash-movement';
export {
  DeleteCashMovement,
  type DeleteCashMovementError,
} from './application/commands/delete-cash-movement';
export { CloseCashPeriods } from './application/commands/close-cash-periods';
export {
  GetCashPeriod,
  type FutureCashPeriodError,
  type GetCashPeriodError,
} from './application/queries/get-cash-period';
export {
  ListCashMovements,
  type ListCashMovementsError,
} from './application/queries/list-cash-movements';
export {
  ListCashPeriods,
  type ListCashPeriodsError,
} from './application/queries/list-cash-periods';
