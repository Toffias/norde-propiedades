import { PERMISSION_CATALOG } from '@norde/core/identity';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../../container';
import { EditRoleEditor } from '../../../../../features/identity/components/role-editor';
import { ROLE_ERROR_MESSAGES } from '../../../../../features/identity/messages';
import { messageForError } from '../../../../../lib/errors';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Rol' };

export default async function RolePage({ params }: { readonly params: Promise<{ id: string }> }) {
  const { actor } = await requireSession();
  const { id } = await params;
  const role = await getContainer().identity.getRole.execute({ roleId: id }, actor);

  if (role.isErr() || role.value.deletedAt !== undefined) {
    const message = role.isErr()
      ? messageForError(role.error, ROLE_ERROR_MESSAGES)
      : 'Este rol está en la papelera: restauralo para editarlo.';
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={message} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">{role.value.name}</h2>
      <EditRoleEditor
        role={role.value}
        catalog={PERMISSION_CATALOG}
        readOnly={!actor.can('roles:update')}
      />
    </div>
  );
}
