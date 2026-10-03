import type { PageSlice } from '../../../shared';
import type {
  Currency,
  Operation,
  PanelPropertyAttributes,
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

/** Los filtros del buscador, ya resueltos (alcance → captador o sucursal; precio → centavos). */
export interface PanelPropertyFilterCriteria {
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
  /** Solo estas propiedades (selección de una acción masiva, comparador). */
  readonly ids: readonly string[] | undefined;
  /** Solo las de este propietario (cliente del módulo clients, por ID). */
  readonly ownerClientId?: string | undefined;
  /** Solo las unidades de este emprendimiento. */
  readonly developmentId?: string | undefined;
}

export interface PanelPropertyListCriteria extends PanelPropertyFilterCriteria {
  readonly sort: { readonly field: PanelPropertySortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Rectángulo visible del mapa, en grados. */
export interface BoundingBox {
  readonly south: number;
  readonly west: number;
  readonly north: number;
  readonly east: number;
}

/** Fila tal como sale de la base: los usuarios, solo por ID. */
export interface PanelPropertyListItem {
  readonly id: string;
  readonly code: string;
  readonly propertyType: PropertyType;
  readonly status: PropertyStatusValue;
  readonly portalTitle: string;
  readonly publishAddress: string | undefined;
  readonly floor: string | undefined;
  readonly unit: string | undefined;
  readonly neighborhood: string;
  readonly city: string;
  readonly province: string;
  readonly operations: readonly PanelPropertyOperation[];
  readonly attributes: PanelPropertyAttributes;
  readonly coverImageUrl: string | undefined;
  readonly coordinates: { readonly latitude: number; readonly longitude: number } | undefined;
  readonly producerUserId: string | undefined;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | undefined;
  readonly deletedBy: string | undefined;
}

/** Puerto de consulta del buscador del panel: SQL paginado en infra. */
export interface PanelPropertyListQuery {
  search(criteria: PanelPropertyListCriteria): Promise<PageSlice<PanelPropertyListItem>>;
  /**
   * IDs que cumplen el filtro, en orden de ID y después de `afterId` (paginación por clave, para
   * recorrer una selección por lotes aunque los cambios la alteren).
   */
  matchingIds(
    criteria: PanelPropertyFilterCriteria,
    page: { readonly afterId: string | undefined; readonly limit: number },
  ): Promise<readonly { readonly id: string; readonly code: string }[]>;
  /** Cuántas cumplen el filtro. */
  count(criteria: PanelPropertyFilterCriteria): Promise<number>;
  /** Propiedades con coordenadas dentro del área, las actualizadas más recientemente primero. */
  mapPins(
    criteria: PanelPropertyFilterCriteria,
    area: BoundingBox,
    limit: number,
  ): Promise<PageSlice<PanelPropertyListItem>>;
}
