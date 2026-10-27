import type { CashBox } from './cash-box';
import type { CashClosing, CashTotals } from './cash-closing';
import type { CashMovement, CashMovementId } from './cash-movement';
import type { CashPeriod } from './cash-period';

export interface CashMovementRepository {
  /** También los anulados y borrados. */
  findById(id: CashMovementId): Promise<CashMovement | undefined>;
  /** El último movimiento activo cargado en el mes de la caja: el único que se puede anular. */
  findLastActive(box: CashBox, period: CashPeriod): Promise<CashMovement | undefined>;
  /** `actorId` queda en `created_by` y `updated_by`. */
  insert(movement: CashMovement, actorId: string): Promise<void>;
  /** `actorId` queda en `updated_by`. */
  save(movement: CashMovement, actorId: string): Promise<void>;
}

export interface CashClosingRepository {
  findByPeriod(box: CashBox, period: CashPeriod): Promise<CashClosing | undefined>;
  /** El último mes cerrado de la caja. */
  lastPeriod(box: CashBox): Promise<CashPeriod | undefined>;
  /**
   * Guarda el cierre si el mes todavía no tenía. Devuelve `false` si otro pedido lo cerró
   * antes: entonces no se registra de nuevo.
   */
  insertIfMissing(closing: CashClosing): Promise<boolean>;
  /** Guarda el recálculo. `actorId` queda en `updated_by`. */
  save(closing: CashClosing, actorId: string): Promise<void>;
}

/** Sumas de los movimientos activos de una caja, calculadas en la base. */
export interface CashLedger {
  /** El mes del primer movimiento de la caja (activo o no). */
  firstPeriod(box: CashBox): Promise<CashPeriod | undefined>;
  /** Saldo acumulado antes del mes, ingresos y egresos del mes. */
  totals(box: CashBox, period: CashPeriod): Promise<CashTotals>;
}
