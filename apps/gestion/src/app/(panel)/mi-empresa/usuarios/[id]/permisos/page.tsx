import { PERMISSION_CATALOG } from '@norde/core/identity';
import { Card } from '@norde/ui/components/card';
import { DataTableError } from '@norde/ui/components/data-table';
import type { Metadata } from 'next';

import { getContainer } from '../../../../../../container';
import { UserPermissionsEditor } from '../../../../../../features/identity/components/user-permissions-editor';
import { USER_ERROR_MESSAGES } from '../../../../../../features/identity/messages';
import { messageForError } from '../../../../../../lib/errors';
import { requireSession } from '../../../../../../lib/session';

export const metadata: Metadata = { title: 'Permisos del usuario' };

export default async function UserPermissionsPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { actor, profile } = await requireSession();
  const { id } = await params;
  const detail = await getContainer().identity.getUserPermissions.execute({ userId: id }, actor);

  if (detail.isErr() || id === profile.id) {
    const message = detail.isErr()
      ? messageForError(detail.error, USER_ERROR_MESSAGES)
      : USER_ERROR_MESSAGES.CannotChangeOwnPermissions;
    return (
      <Card className="gap-0 overflow-hidden p-0">
        <DataTableError message={message} />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">Permisos de {detail.value.name}</h2>
        <p className="text-sm text-muted-foreground">
          Excepciones a sus roles. Denegar gana siempre, también sobre un permiso que viene de un
          rol.
        </p>
      </div>
      <UserPermissionsEditor
        userId={detail.value.userId}
        catalog={PERMISSION_CATALOG}
        fromRoles={detail.value.grantedByRoles}
        own={detail.value.ownPermissions}
      />
    </div>
  );
}
