import type { PageSlice } from '../../../shared';
import type { PropertyReservationSortField, ReservationRow } from '../../contracts';

/** Una reserva como la lee la base: los usuarios van por ID y el caso de uso pone sus nombres. */
export type ReservationListItem = Omit<ReservationRow, 'agent' | 'manager'> & {
  readonly agentUserId: string | undefined;
  readonly managerUserId: string | undefined;
};

/** Las reservas de una propiedad, con el nombre del cliente resuelto. */
export interface PropertyReservationsQuery {
  listByProperty(query: {
    readonly propertyId: string;
    readonly sort: {
      readonly field: PropertyReservationSortField;
      readonly direction: 'asc' | 'desc';
    };
    readonly offset: number;
    readonly limit: number;
  }): Promise<PageSlice<ReservationListItem>>;
  /** La reserva activa de la propiedad, si tiene. */
  findActive(propertyId: string): Promise<ReservationListItem | undefined>;
}
