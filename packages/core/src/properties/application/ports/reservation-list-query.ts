import type { PageSlice } from '../../../shared';
import type {
  Operation,
  PropertyType,
  ReservationListRow,
  ReservationSortField,
  ReservationStatusValue,
} from '../../contracts';
import type { ReservationListItem } from './property-reservations-query';

/** Una reserva del listado como la lee la base: la propiedad va resuelta; los usuarios, por ID. */
export type ReservationSearchItem = ReservationListItem & {
  readonly property: ReservationListRow['property'];
};

/** Los filtros ya validados, con las fechas de reserva como instantes UTC. */
export interface ReservationFilterCriteria {
  readonly status?: ReservationStatusValue | undefined;
  readonly operation?: Operation | undefined;
  readonly propertyType?: PropertyType | undefined;
  readonly agentUserId?: string | undefined;
  readonly managerUserId?: string | undefined;
  readonly branchId?: string | undefined;
  /** `reserved_at` en `[from, to)`. */
  readonly reserved: { readonly from: Date | undefined; readonly to: Date | undefined };
  /** Fecha estimada de firma (`AAAA-MM-DD`), inclusive. */
  readonly signing: { readonly from: string | undefined; readonly to: string | undefined };
}

/** Todas las reservas (`/reservas`), con filtros y paginadas en la base. */
export interface ReservationListQuery {
  search(
    query: ReservationFilterCriteria & {
      readonly sort: { readonly field: ReservationSortField; readonly direction: 'asc' | 'desc' };
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<ReservationSearchItem>>;
  count(criteria: ReservationFilterCriteria): Promise<number>;
}
