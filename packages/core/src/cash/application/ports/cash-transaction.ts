import type { AuditLog, UnitOfWork } from '../../../shared';
import type {
  CashClosingRepository,
  CashLedger,
  CashMovementRepository,
} from '../../domain/cash.repository';

/**
 * Lo que un caso de uso de la caja usa dentro de la transacción, ligado a la misma conexión. La
 * caja no emite eventos de dominio: ningún otro módulo reacciona a sus cambios.
 */
export interface CashTransaction {
  readonly movements: CashMovementRepository;
  readonly closings: CashClosingRepository;
  readonly ledger: CashLedger;
  readonly audit: AuditLog;
}

export type CashUnitOfWork = UnitOfWork<CashTransaction>;
