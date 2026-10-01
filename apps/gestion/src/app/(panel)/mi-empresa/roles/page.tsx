import { ListRolesQuerySchema } from '@norde/core/identity/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { RolesGrid } from '../../../../features/identity/components/roles-grid';
import { ROLE_ERROR_MESSAGES } from '../../../../features/identity/messages';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Roles' };

export default async function RolesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(ListRolesQuerySchema, await searchParams);
  const roles = await getContainer().identity.listRoles.execute(query, actor);

  if (roles.isErr()) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={messageForError(roles.error, ROLE_ERROR_MESSAGES)} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {query.view === 'trash'
          ? formatCount(roles.value.total, 'rol en la papelera', 'roles en la papelera')
          : `${formatCount(roles.value.total, 'rol', 'roles')}. Un usuario puede tener varios: sus permisos se suman.`}
      </p>

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos parámetros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron
          los valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <RolesGrid
          rows={roles.value.items}
          total={roles.value.total}
          page={roles.value.page}
          pageSize={roles.value.pageSize}
          sort={query.sort}
          view={query.view}
          text={query.q ?? ''}
          permissions={{
            create: actor.can('roles:create'),
            update: actor.can('roles:update'),
            delete: actor.can('roles:delete'),
          }}
        />
      </Card>
    </div>
  );
}
