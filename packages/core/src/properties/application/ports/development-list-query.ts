import type { PageSlice } from '../../../shared';
import type {
  ConstructionStatusValue,
  DevelopmentMapPin,
  DevelopmentRow,
  DevelopmentSortField,
  DevelopmentStatusValue,
  DevelopmentType,
  DevelopmentViewValue,
} from '../../contracts';
import type { BoundingBox } from './panel-property-list-query';

/** Los filtros del listado de emprendimientos, ya validados. */
export interface DevelopmentListCriteria {
  readonly view: DevelopmentViewValue;
  /** Código, nombre, dirección o desarrollista, sin distinguir mayúsculas ni acentos. */
  readonly text: string | undefined;
  readonly status: DevelopmentStatusValue | undefined;
  readonly developmentType: DevelopmentType | undefined;
  readonly constructionStatus: ConstructionStatusValue | undefined;
  readonly tagId: string | undefined;
  readonly sort: { readonly field: DevelopmentSortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Los filtros que comparten el listado y el mapa. */
export type DevelopmentFilterCriteria = Pick<
  DevelopmentListCriteria,
  'text' | 'status' | 'developmentType' | 'constructionStatus' | 'tagId'
>;

/** Fila tal como sale de la base: quién borró, solo por ID. */
export type DevelopmentListItem = Omit<DevelopmentRow, 'deletedBy'> & {
  readonly deletedBy: string | undefined;
};

/** Puerto de consulta del listado de emprendimientos: SQL paginado en infra. */
export interface DevelopmentListQuery {
  search(criteria: DevelopmentListCriteria): Promise<PageSlice<DevelopmentListItem>>;
  /**
   * Los activos con coordenadas dentro del rectángulo que cumplen los filtros, los actualizados
   * más recientemente primero, hasta `limit`. `total` cuenta todos los del área.
   */
  mapPins(
    criteria: DevelopmentFilterCriteria,
    area: BoundingBox,
    limit: number,
  ): Promise<PageSlice<DevelopmentMapPin>>;
}
