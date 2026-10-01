import { PERMISSION_CATALOG } from '@norde/core/identity';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { CreateRoleEditor } from '../../../../../features/identity/components/role-editor';
import { requireSession } from '../../../../../lib/session';

export const metadata: Metadata = { title: 'Nuevo rol' };

export default async function NewRolePage() {
  const { actor } = await requireSession();
  // Solo para no mostrar un formulario que va a fallar: la autorización la decide `CreateRole`.
  if (!actor.can('roles:create')) redirect('/mi-empresa/roles');

  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold">Nuevo rol</h2>
      <CreateRoleEditor catalog={PERMISSION_CATALOG} />
    </div>
  );
}
