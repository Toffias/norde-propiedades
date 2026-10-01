import 'server-only';

import type { Actor } from '@norde/core/shared';

import { getContainer } from '../../container';
import { messageForError } from '../../lib/errors';
import type { PanelData } from '../../lib/panel-params';
import { PANEL_GRID_PAGE_SIZE, type PanelUsersPage } from './panels';

/**
 * Una página de los usuarios de un equipo o de una sucursal, para la pestaña de su panel. Es el
 * listado de usuarios con el filtro: paginado en el servidor.
 */
export async function loadPanelUsers(
  id: string,
  filter: { readonly teamId: string } | { readonly branchId: string },
  page: number,
  actor: Actor,
): Promise<PanelData<PanelUsersPage>> {
  const users = await getContainer().identity.listUsers.execute(
    { ...filter, page, pageSize: PANEL_GRID_PAGE_SIZE },
    actor,
  );
  if (users.isErr()) return { id, ok: false, message: messageForError(users.error) };
  const { items, total, pageSize } = users.value;
  return { id, ok: true, value: { rows: items, total, page: users.value.page, pageSize } };
}
