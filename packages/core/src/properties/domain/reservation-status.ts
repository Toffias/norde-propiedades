// Estados de una reserva. Los contracts tienen la misma lista para los formularios (el dominio no
// importa contracts); un test verifica que coincidan.

/** `active`: vigente. `fallen`: se cayó (la propiedad vuelve a estar disponible). `signed`: firmada. */
export const RESERVATION_STATUSES = ['active', 'fallen', 'signed'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** Una reserva activa se cae o se firma; caída y firmada son finales. */
const TRANSITIONS: Readonly<Record<ReservationStatus, readonly ReservationStatus[]>> = {
  active: ['fallen', 'signed'],
  fallen: [],
  signed: [],
};

export function canReservationTransition(from: ReservationStatus, to: ReservationStatus): boolean {
  return TRANSITIONS[from].includes(to);
}
