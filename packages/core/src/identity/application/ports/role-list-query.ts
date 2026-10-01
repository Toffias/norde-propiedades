import type { PageSlice } from '../../../shared';
import type { RoleListItem, RoleSortField } from '../../contracts';

export interface RoleListCriteria {
  /** Nombre del rol, sin distinguir mayúsculas ni acentos. */
  readonly text: string | undefined;
  readonly sort: { readonly field: RoleSortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Puerto de consulta del listado de roles: SQL paginado en infra. */
export interface RoleListQuery {
  search(criteria: RoleListCriteria): Promise<PageSlice<RoleListItem>>;
}
