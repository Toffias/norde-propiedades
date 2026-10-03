import type { PageSlice } from '../../../shared';
import type {
  ConstructionStatusValue,
  DevelopmentRow,
  DevelopmentSortField,
  DevelopmentStatusValue,
  DevelopmentType,
  DevelopmentViewValue,
} from '../../contracts';

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

/** Fila tal como sale de la base: quién borró, solo por ID. */
export type DevelopmentListItem = Omit<DevelopmentRow, 'deletedBy'> & {
  readonly deletedBy: string | undefined;
};

/** Puerto de consulta del listado de emprendimientos: SQL paginado en infra. */
export interface DevelopmentListQuery {
  search(criteria: DevelopmentListCriteria): Promise<PageSlice<DevelopmentListItem>>;
}
