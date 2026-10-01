import type { PageSlice } from '../../../shared';
import type { UserListItem, UserSortField, UserStatusValue } from '../../contracts';

export interface UserListCriteria {
  readonly status: UserStatusValue;
  /** Nombre o email, sin distinguir mayúsculas ni acentos. */
  readonly text: string | undefined;
  readonly sort: { readonly field: UserSortField; readonly direction: 'asc' | 'desc' };
  readonly offset: number;
  readonly limit: number;
}

/** Puerto de consulta del listado de usuarios: SQL paginado en infra. */
export interface UserListQuery {
  search(criteria: UserListCriteria): Promise<PageSlice<UserListItem>>;
}
