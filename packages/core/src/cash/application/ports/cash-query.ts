import type { PageSlice } from '../../../shared';
import type { CashMovementRow, CashPeriodRow } from '../../contracts';
import type { CashBox } from '../../domain/cash-box';
import type { CashPeriod } from '../../domain/cash-period';

export type CashMovementListItem = Omit<CashMovementRow, 'createdByName'>;

/** Consultas de la planilla de la caja, paginadas en la base. */
export interface CashQuery {
  /**
   * Los movimientos activos del mes, con el saldo de la caja después de cada uno. El saldo corre
   * en orden de fecha y de carga desde el saldo inicial del mes, aunque la página venga en el
   * orden inverso.
   */
  movements(params: {
    readonly box: CashBox;
    readonly period: CashPeriod;
    readonly sort: { readonly field: 'date'; readonly direction: 'asc' | 'desc' };
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<CashMovementListItem>>;
  /** Los meses cerrados de la caja más el vigente (`current`), aunque todavía no tenga movimientos. */
  periods(params: {
    readonly box: CashBox;
    readonly current: CashPeriod;
    readonly sort: { readonly field: 'period'; readonly direction: 'asc' | 'desc' };
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<CashPeriodRow>>;
}

/** Nombres de los usuarios del panel (identity), para mostrar quién cargó cada movimiento. */
export interface CashUserNames {
  /** Como mucho, los de una página. Los que no existen o no están activos no vuelven. */
  names(userIds: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
