import { ListUsersQuerySchema } from '@norde/core/identity/contracts';
import { MAX_PAGE_SIZE } from '@norde/core/shared/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import type { RoleOption } from '../../../../features/identity/components/role-checkboxes';
import { UsersGrid } from '../../../../features/identity/components/users-grid';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Usuarios' };

export default async function UsersPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor, profile } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(ListUsersQuerySchema, await searchParams);
  const { identity } = getContainer();

  const [users, roles] = await Promise.all([
    identity.listUsers.execute(query, actor),
    // Los roles para el formulario: son pocos, entran en una página.
    identity.listRoles.execute({ pageSize: MAX_PAGE_SIZE }, actor),
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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {formatCount(
          users.value.total,
          query.status === 'active' ? 'usuario activo' : 'usuario suspendido',
          query.status === 'active' ? 'usuarios activos' : 'usuarios suspendidos',
        )}
      </p>

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
