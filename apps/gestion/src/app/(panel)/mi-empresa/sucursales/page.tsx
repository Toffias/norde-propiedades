import { ListBranchesQuerySchema } from '@norde/core/identity/contracts';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Actor } from '@norde/core/shared';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import type { BranchSheetData } from '../../../../features/identity/components/branch-sheet';
import { BranchesGrid } from '../../../../features/identity/components/branches-grid';
import { BRANCH_ERROR_MESSAGES } from '../../../../features/identity/messages';
import { loadPanelUsers } from '../../../../features/identity/panel-users';
import { branchTab } from '../../../../features/identity/panels';
import { messageForError } from '../../../../lib/errors';
import { formatCount } from '../../../../lib/format';
import { parseListParams, type SearchParams } from '../../../../lib/list-params';
import {
  parsePanelPage,
  parsePanelParams,
  type PanelData,
  type PanelState,
} from '../../../../lib/panel-params';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Sucursales' };

export default async function BranchesPage({
  searchParams,
}: {
  readonly searchParams: Promise<SearchParams>;
}) {
  const { actor } = await requireSession();
  const params = await searchParams;
  const { value: query, invalidKeys } = parseListParams(ListBranchesQuerySchema, params);
  const [branches, detail] = await Promise.all([
    getContainer().identity.listBranches.execute(query, actor),
    loadBranchPanel(parsePanelParams(params), parsePanelPage(params), actor),
  ]);

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
          detail={detail}
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

/** La sucursal del panel de edición y, en la pestaña "Usuarios", una página de sus usuarios. */
async function loadBranchPanel(
  panel: PanelState | undefined,
  page: number,
  actor: Actor,
): Promise<PanelData<BranchSheetData> | undefined> {
  if (panel?.kind !== 'edit') return undefined;
  const branch = await getContainer().identity.getBranch.execute({ branchId: panel.id }, actor);
  if (branch.isErr()) {
    return {
      id: panel.id,
      ok: false,
      message: messageForError(branch.error, BRANCH_ERROR_MESSAGES),
    };
  }
  if (branch.value.deletedAt !== undefined) {
    return {
      id: panel.id,
      ok: false,
      message: 'Esta sucursal está en la papelera: restaurala para editarla.',
    };
  }
  return {
    id: panel.id,
    ok: true,
    value: {
      branch: branch.value,
      users:
        branchTab(panel.tab) === 'users'
          ? await loadPanelUsers(panel.id, { branchId: panel.id }, page, actor)
          : undefined,
    },
  };
}
