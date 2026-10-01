import type { PageSlice } from '../../../shared';
import type { RoleDetail, RoleListItem, RoleSortField, RoleViewValue } from '../../contracts';

export interface RoleListCriteria {
  readonly view: RoleViewValue;
  /** Nombre del rol, sin distinguir mayúsculas ni acentos. */
  readonly text: string | undefined;
  readonly sort: { readonly field: RoleSortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Puerto de consulta de roles: el listado paginado y el detalle para el editor. */
export interface RoleListQuery {
  search(criteria: RoleListCriteria): Promise<PageSlice<RoleListItem>>;
  /** También los que están en la papelera. */
  findById(id: string): Promise<RoleDetail | undefined>;
}
