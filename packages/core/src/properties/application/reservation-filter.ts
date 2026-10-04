import type { ReservationFilter } from '../contracts';
import type { ReservationFilterCriteria } from './ports/reservation-list-query';

// Los filtros del listado de reservas (`/reservas`), compartidos por el listado y la exportación.

const DAY_MS = 24 * 60 * 60 * 1000;

/** `AAAA-MM-DD` de Buenos Aires (UTC−3, sin horario de verano) → instante UTC del comienzo del día. */
function startOfDay(date: string): Date {
  return new Date(`${date}T03:00:00.000Z`);
}

/** Los filtros ya validados por el contract, como los recibe el puerto. */
export function reservationCriteria(filter: ReservationFilter): ReservationFilterCriteria {
  return {
    status: filter.status,
    operation: filter.operation,
    propertyType: filter.propertyType,
    agentUserId: filter.agentId,
    managerUserId: filter.managerId,
    branchId: filter.branchId,
    reserved: {
      from: filter.reservedFrom === undefined ? undefined : startOfDay(filter.reservedFrom),
      to:
        filter.reservedTo === undefined
          ? undefined
          : new Date(startOfDay(filter.reservedTo).getTime() + DAY_MS),
    },
    signing: { from: filter.signingFrom, to: filter.signingTo },
  };
}
