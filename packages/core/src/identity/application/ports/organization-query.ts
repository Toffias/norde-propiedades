import type { PageSlice } from '../../../shared';
import type {
  BranchDetail,
  BranchListItem,
  OrganizationSortField,
  TeamDetail,
  TeamListItem,
  TrashViewValue,
} from '../../contracts';

interface ListCriteria {
  readonly view: TrashViewValue;
  /** Nombre, sin distinguir mayúsculas ni acentos. */
  readonly text: string | undefined;
  readonly sort: { readonly field: OrganizationSortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

export type BranchListCriteria = ListCriteria;

export interface TeamListCriteria extends ListCriteria {
  readonly branchId: string | undefined;
}

/** Puerto de consulta de sucursales y equipos: listados paginados y detalle (SQL en infra). */
export interface OrganizationQuery {
  searchBranches(criteria: BranchListCriteria): Promise<PageSlice<BranchListItem>>;
  /** También las de la papelera. */
  findBranch(id: string): Promise<BranchDetail | undefined>;
  searchTeams(criteria: TeamListCriteria): Promise<PageSlice<TeamListItem>>;
  /** También los de la papelera. */
  findTeam(id: string): Promise<TeamDetail | undefined>;
}
