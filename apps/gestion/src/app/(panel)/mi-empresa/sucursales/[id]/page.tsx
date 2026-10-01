import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../../container';
import { EditBranchForm } from '../../../../../features/identity/components/branch-form-dialog';
import { BRANCH_ERROR_MESSAGES } from '../../../../../features/identity/messages';
import { messageForError } from '../../../../../lib/errors';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Sucursal' };

export default async function BranchPage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { actor } = await requireSession();
  const { id } = await params;
  const branch = await getContainer().identity.getBranch.execute({ branchId: id }, actor);

  if (branch.isErr() || branch.value.deletedAt !== undefined) {
    const message = branch.isErr()
      ? messageForError(branch.error, BRANCH_ERROR_MESSAGES)
      : 'Esta sucursal está en la papelera: restaurala para editarla.';
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={message} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{branch.value.name}</h2>
      <Card className="p-4">
        <EditBranchForm branch={branch.value} />
      </Card>
    </div>
  );
}
