import type { UserListItem } from '@norde/core/identity/contracts';

// Pestañas de los paneles laterales de identidad. Fuera de los componentes cliente: las usan
// también las páginas (Server Components) para saber qué cargar.

/** Filas por página de una grilla dentro de un panel: una página corta y fija. */
export const PANEL_GRID_PAGE_SIZE = 10;

/** Una página de usuarios dentro de un panel (los miembros de un equipo, los de una sucursal). */
export interface PanelUsersPage {
  readonly rows: readonly UserListItem[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export type TeamTab = 'details' | 'members';

/** La pestaña pedida en la URL; "Datos" si falta o no es una de las del panel. */
export function teamTab(tab: string | undefined): TeamTab {
  return tab === 'members' ? 'members' : 'details';
}

export type BranchTab = 'details' | 'users';

export function branchTab(tab: string | undefined): BranchTab {
  return tab === 'users' ? 'users' : 'details';
}

export type UserTab = 'details' | 'permissions';

export function userTab(tab: string | undefined): UserTab {
  return tab === 'permissions' ? 'permissions' : 'details';
}
