import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getContainer } from '../../container';
import { PanelShell } from '../../features/shell/components/panel-shell';
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from '../../features/shell/navigation';
import { requireSession } from '../../lib/session';

// Toda ruta del panel exige sesión. La autorización de cada acción la decide su caso de uso.
export default async function PanelLayout({ children }: { readonly children: ReactNode }) {
  const { profile, actor } = await requireSession();
  // Con una contraseña temporal la sesión no tiene permisos: lo único que puede hacer es cambiarla.
  if (profile.mustChangePassword) redirect('/cambiar-contrasena');
  const collapsed = (await cookies()).get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;
  // Las oportunidades nuevas asignadas a quien entra: lo que tiene pendiente de atender.
  const pending = await getContainer().clients.countPendingOpportunities.execute(actor);

  return (
    <PanelShell
      profile={profile}
      initiallyCollapsed={collapsed}
      counts={{ '/oportunidades': pending.isOk() ? pending.value : 0 }}
    >
      {children}
    </PanelShell>
  );
}
