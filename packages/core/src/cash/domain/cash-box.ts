/**
 * Las cajas de la oficina. Son fijas: cada una lleva sus propios movimientos, saldos y cierres.
 * Agregar una es un cambio de código (ver #164).
 */
export const CASH_BOXES = ['office', 'osvaldo'] as const;
export type CashBox = (typeof CASH_BOXES)[number];

/** La caja chica se lleva en pesos. */
export const CASH_CURRENCY = 'ARS';
export type CashCurrency = typeof CASH_CURRENCY;
