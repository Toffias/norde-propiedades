import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { getContainer } from '../../container';
import { PanelShell } from '../../features/shell/components/panel-shell';
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from '../../features/shell/navigation';
import { parseSearchKinds, SEARCH_KINDS_COOKIE } from '../../features/shell/search-kinds';
import { requireSession } from '../../lib/session';

// Toda ruta del panel exige sesión. La autorización de cada acción la decide su caso de uso.
export default async function PanelLayout({ children }: { readonly children: ReactNode }) {
  const { profile, actor } = await requireSession();
  // Con una contraseña temporal la sesión no tiene permisos: lo único que puede hacer es cambiarla.
  if (profile.mustChangePassword) redirect('/cambiar-contrasena');
  const cookieStore = await cookies();
  const collapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === SIDEBAR_COLLAPSED;
  const searchKinds = parseSearchKinds(cookieStore.get(SEARCH_KINDS_COOKIE)?.value);
  const { clients, inquiries, settings } = getContainer();
  // Las oportunidades nuevas asignadas a quien entra (lo que tiene pendiente de atender) y las
  // consultas sin asignar.
  const [pending, unassigned, brand] = await Promise.all([
    clients.countPendingOpportunities.execute(actor),
    inquiries.countPendingInquiries.execute(actor),
    settings.getCompanyBrand.execute({}, actor),
  ]);

  return (
    <PanelShell
      profile={profile}
      initiallyCollapsed={collapsed}
      searchKinds={searchKinds}
      brand={brand.isOk() ? brand.value : undefined}
      counts={{
        '/oportunidades': pending.isOk() ? pending.value : 0,
        '/consultas': unassigned.isOk() ? unassigned.value : 0,
      }}
    >
      {children}
    </PanelShell>
  );
}
