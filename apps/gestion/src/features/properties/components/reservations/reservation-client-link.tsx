import type { ReservationRow } from '@norde/core/properties/contracts';
import type { Route } from 'next';
import Link from 'next/link';

import { reservationClient } from './reservation-format';

/** El contacto de la reserva con enlace a su ficha, o "Sin contacto" si se reservó sin él. */
export function ReservationClientLink({
  reservation,
}: {
  readonly reservation: Pick<ReservationRow, 'client'>;
}) {
  if (reservation.client === undefined) {
    return <span className="text-muted-foreground italic">{reservationClient(reservation)}</span>;
  }
  return (
    <Link
      // La ficha del contacto: typedRoutes no verifica un segmento armado.
      href={`/contactos/${reservation.client.id}` as Route}
      className="font-medium hover:underline"
    >
      {reservationClient(reservation)}
    </Link>
  );
}
