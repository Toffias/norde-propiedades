import type { VisibilityFilter } from '../../../identity';
import type { PageSlice } from '../../../shared';
import type {
  AppraisalDetail,
  AppraisalListRow,
  AppraisalSortField,
  AppraisalStatusValue,
  PropertyType,
} from '../../contracts';

type WithIds<T> = Omit<T, 'requester' | 'producer' | 'appraiser' | 'branch'> & {
  readonly requesterClientId: string;
  /** `undefined` si el contacto ya no está (papelera o supresión). */
  readonly requesterName: string | undefined;
  readonly producerUserId: string;
  readonly appraiserUserId: string | undefined;
  readonly branchId: string | undefined;
};

/** Una tasación del listado como la lee la base: el contacto va resuelto; usuarios, por ID. */
export type AppraisalSearchItem = WithIds<AppraisalListRow>;

/** La ficha de una tasación como la lee la base. */
export type AppraisalDetailItem = WithIds<AppraisalDetail>;

/** Los filtros ya validados, con las fechas como instantes UTC en `[from, to)`. */
export interface AppraisalFilterCriteria {
  /** Lo que el usuario puede ver: lo que produce o tasa, o todo. */
  readonly visibility: VisibilityFilter;
  /** `true`: solo las de la papelera; `false`: solo las activas. */
  readonly deleted: boolean;
  readonly statuses: readonly AppraisalStatusValue[] | undefined;
  readonly propertyType: PropertyType | undefined;
  readonly producerUserId: string | undefined;
  readonly appraiserUserId: string | undefined;
  readonly branchId: string | undefined;
  readonly created: { readonly from: Date | undefined; readonly to: Date | undefined };
  readonly visit: { readonly from: Date | undefined; readonly to: Date | undefined };
}

/** Lecturas de tasaciones para el panel: el listado paginado en la base y la ficha. */
export interface AppraisalQuery {
  search(
    query: AppraisalFilterCriteria & {
      readonly sort: { readonly field: AppraisalSortField; readonly direction: 'asc' | 'desc' };
      readonly offset: number;
      readonly limit: number;
    },
  ): Promise<PageSlice<AppraisalSearchItem>>;
  /** También las de la papelera. */
  findDetail(appraisalId: string): Promise<AppraisalDetailItem | undefined>;
}
