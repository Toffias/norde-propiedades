import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import { PortalFooterForm } from '../../../../features/settings/components/portal-footer-form';
import { loadCompanySettings } from '../../../../features/settings/queries';

export const metadata: Metadata = { title: 'Portales' };

export default async function PortalsSettingsPage() {
  const loaded = await loadCompanySettings();
  if (!loaded.ok) {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }

  return (
    <SectionCard title="Descripción en portales">
      <PortalFooterForm
        footer={loaded.settings.portalDescriptionFooter}
        disabled={!loaded.canUpdate}
      />
    </SectionCard>
  );
}
