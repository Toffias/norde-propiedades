import { PublicLayout } from '@norde/ui/components/public-layout';
import type { Metadata } from 'next';

import { ChangePasswordForm } from '../../features/identity/components/change-password-form';
import { requireSession } from '../../lib/session';

export const metadata: Metadata = { title: 'Elegí tu contraseña' };

// Fuera del layout del panel: ahí se redirige acá a quien tiene una contraseña temporal.
export default async function ChangePasswordPage() {
  const { profile } = await requireSession();

  return (
    <PublicLayout>
      <ChangePasswordForm temporary={profile.mustChangePassword} />
    </PublicLayout>
  );
}
