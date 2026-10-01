import type { PageSlice } from '../../../shared';
import type {
  Currency,
  Operation,
  PanelPropertyOperation,
  PanelPropertySortField,
  PropertyStatusValue,
  PropertyType,
  PropertyViewValue,
} from '../../contracts';

/** Filtro de pertenencia que resuelve el SQL: todas, las de un captador o las de una sucursal. */
export type PropertyOwnerFilter =
  | { readonly kind: 'all' }
  | { readonly kind: 'producer'; readonly userId: string }
  | { readonly kind: 'branch'; readonly branchId: string };

export interface PanelPropertyListCriteria {
  readonly view: PropertyViewValue;
  readonly owner: PropertyOwnerFilter;
  /** Código, título o dirección, sin distinguir mayúsculas ni acentos. */
  readonly text: string | undefined;
  readonly operation: Operation | undefined;
  readonly propertyType: PropertyType | undefined;
  readonly status: PropertyStatusValue | undefined;
  /** Barrio, localidad o provincia. */
  readonly location: string | undefined;
  /** Moneda del rango y del orden por precio. Con operación, el precio es el de esa operación. */
  readonly price:
    | {
        readonly currency: Currency;
        readonly minCents: bigint | undefined;
        readonly maxCents: bigint | undefined;
      }
    | undefined;
  readonly sort: { readonly field: PanelPropertySortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Fila tal como sale de la base: los usuarios, solo por ID. */
export interface PanelPropertyListItem {
  readonly id: string;
  readonly code: string;
  readonly propertyType: PropertyType;
  readonly status: PropertyStatusValue;
  readonly portalTitle: string;
  readonly publishAddress: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly operations: readonly PanelPropertyOperation[];
  readonly producerUserId: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

/** Puerto de consulta del buscador del panel: SQL paginado en infra. */
export interface PanelPropertyListQuery {
  search(criteria: PanelPropertyListCriteria): Promise<PageSlice<PanelPropertyListItem>>;
}
