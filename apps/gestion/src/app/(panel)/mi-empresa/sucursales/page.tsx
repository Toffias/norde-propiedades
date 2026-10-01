import { ListBranchesQuerySchema } from '@norde/core/identity/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { BranchesGrid } from '../../../../features/identity/components/branches-grid';
import { BRANCH_ERROR_MESSAGES } from '../../../../features/identity/messages';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Sucursales' };

export default async function BranchesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const { value: query, invalidKeys } = parseListParams(
    ListBranchesQuerySchema,
    await searchParams,
  );
  const branches = await getContainer().identity.listBranches.execute(query, actor);

  if (branches.isErr()) {
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={messageForError(branches.error, BRANCH_ERROR_MESSAGES)} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        {query.view === 'trash'
          ? formatCount(
              branches.value.total,
              'sucursal en la papelera',
              'sucursales en la papelera',
            )
          : formatCount(branches.value.total, 'sucursal', 'sucursales')}
      </p>

      {invalidKeys.length > 0 && (
        <p role="status" className="text-sm text-muted-foreground">
          Algunos parámetros de la dirección no eran válidos ({invalidKeys.join(', ')}) y se usaron
          los valores por defecto.
        </p>
      )}

      <Card className="gap-0 overflow-hidden p-0">
        <BranchesGrid
          rows={branches.value.items}
          total={branches.value.total}
          page={branches.value.page}
          pageSize={branches.value.pageSize}
          sort={query.sort}
          view={query.view}
          text={query.q ?? ''}
          permissions={{
            create: actor.can('branches:create'),
            update: actor.can('branches:update'),
            delete: actor.can('branches:delete'),
          }}
        />
      </Card>
    </div>
  );
}
