import type { ReservationRow } from '@norde/core/properties/contracts';

import { EMPTY_VALUE, formatMoney } from '../../../../lib/format';

/** "3,5 % · US$ 4.200", "3 %", "US$ 4.200" o "—". */
export function reservationCommission(
  reservation: Pick<ReservationRow, 'commissionPct' | 'commission'>,
): string {
  const parts = [
    reservation.commissionPct === undefined
      ? undefined
      : `${reservation.commissionPct.toLocaleString('es-AR')} %`,
    reservation.commission === undefined ? undefined : formatMoney(reservation.commission),
  ].filter((part) => part !== undefined);
  return parts.length === 0 ? EMPTY_VALUE : parts.join(' · ');
}

export function reservationAmount(reservation: Pick<ReservationRow, 'amount'>): string {
  return reservation.amount === undefined ? EMPTY_VALUE : formatMoney(reservation.amount);
}

/** El nombre del contacto, o por qué no se muestra. */
export function reservationClient(reservation: Pick<ReservationRow, 'client'>): string {
  return reservation.client.name ?? 'Contacto en la papelera';
}
