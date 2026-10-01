import { PERMISSION_CATALOG } from '@norde/core/identity';
import { ListUsersQuerySchema, type UserListItem } from '@norde/core/identity/contracts';
import { MAX_PAGE_SIZE } from '@norde/core/shared/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';
import Link from 'next/link';

import { getContainer } from '../../../../container';
import type { RoleOption } from '../../../../features/identity/components/role-checkboxes';
import type { UserSheetData } from '../../../../features/identity/components/user-sheet';
import { UsersGrid } from '../../../../features/identity/components/users-grid';
import { USER_ERROR_MESSAGES } from '../../../../features/identity/messages';
import { userTab } from '../../../../features/identity/panels';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { parsePanelParams, type PanelData, type PanelState } from '../../../../lib/panel-params';
import { requireSession } from '../../../../lib/session';
import type { Actor } from '@norde/core/shared';

export const metadata: Metadata = { title: 'Usuarios' };

export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor, profile } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListUsersQuerySchema, params);
  const panel = parsePanelParams(params);
  const { identity } = getContainer();

  const [users, roles, branch] = await Promise.all([
    identity.listUsers.execute(query, actor),
    // Los roles para el formulario: son pocos, entran en una página.
    identity.listRoles.execute({ pageSize: MAX_PAGE_SIZE }, actor),
    // Desde "Ver usuarios" de una sucursal: para nombrarla arriba de la grilla.
    query.branchId === undefined
      ? undefined
      : identity.getBranch.execute({ branchId: query.branchId }, actor),
  ]);

  if (users.isErr()) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={messageForError(users.error)} />
      </Card>
    );
  }

  const roleOptions: RoleOption[] = roles.isOk()
    ? roles.value.items.map(({ id, name, description }) => ({ id, name, description }))
    : [];
  // Sin acceso a los roles no se puede elegir ninguno: no se ofrece crear ni editar.
  const canPickRoles = roles.isOk();
  const detail = await loadUserPanel(panel, users.value.items, profile.id, actor);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {formatCount(
          users.value.total,
          query.status === 'active' ? 'usuario activo' : 'usuario suspendido',
          query.status === 'active' ? 'usuarios activos' : 'usuarios suspendidos',
        )}
      </p>

      {query.branchId !== undefined && (
        <p role="status" className="text-sm text-muted-foreground">
          Usuarios de la sucursal{' '}
          <span className="font-medium text-foreground">
            {branch?.isOk() === true ? branch.value.name : 'elegida'}
          </span>
          .{' '}
          <Link href="/mi-empresa/usuarios" className="underline underline-offset-2">
            Ver todos
          </Link>
        </p>
      )}

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos parámetros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron
          los valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <UsersGrid
          rows={users.value.items}
          total={users.value.total}
          page={users.value.page}
          pageSize={users.value.pageSize}
          sort={query.sort}
          status={query.status}
          text={query.q ?? ''}
          roles={roleOptions}
          currentUserId={profile.id}
          detail={detail}
          catalog={PERMISSION_CATALOG}
          permissions={{
            create: canPickRoles && actor.can('users:create'),
            update: canPickRoles && actor.can('users:update'),
            suspend: actor.can('users:suspend'),
            resetPassword: actor.can('users:reset-password'),
            permissions: actor.can('users:permissions'),
          }}
        />
      </Card>
    </div>
  );
}

/**
 * El usuario del panel de edición y, en la pestaña "Permisos propios", sus permisos. Los datos del
 * usuario salen de la página actual del listado: el panel se abre desde una de sus filas.
 */
async function loadUserPanel(
  panel: PanelState | undefined,
  rows: readonly UserListItem[],
  currentUserId: string,
  actor: Actor,
): Promise<PanelData<UserSheetData> | undefined> {
  if (panel?.kind !== 'edit') return undefined;
  const user = rows.find((row) => row.id === panel.id);
  if (user === undefined) {
    return {
      id: panel.id,
      ok: false,
      message: 'Este usuario no está en esta página del listado: buscalo y abrilo desde su fila.',
    };
  }
  if (userTab(panel.tab) !== 'permissions') {
    return { id: panel.id, ok: true, value: { user, permissions: undefined } };
  }
  if (user.id === currentUserId) {
    return {
      id: panel.id,
      ok: true,
      value: {
        user,
        permissions: {
          id: user.id,
          ok: false,
          message: USER_ERROR_MESSAGES.CannotChangeOwnPermissions,
        },
      },
    };
  }
  const permissions = await getContainer().identity.getUserPermissions.execute(
    { userId: user.id },
    actor,
  );
  return {
    id: panel.id,
    ok: true,
    value: {
      user,
      permissions: permissions.isErr()
        ? {
            id: user.id,
            ok: false,
            message: messageForError(permissions.error, USER_ERROR_MESSAGES),
          }
        : { id: user.id, ok: true, value: permissions.value },
    },
  };
}
