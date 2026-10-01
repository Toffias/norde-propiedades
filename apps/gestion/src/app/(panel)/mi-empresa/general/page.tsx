import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import { GeneralSettingsForm } from '../../../../features/settings/components/general-settings-form';
import { LogoUploader } from '../../../../features/settings/components/logo-uploader';
import { loadCompanySettings } from '../../../../features/settings/queries';

export const metadata: Metadata = { title: 'Mi empresa' };

export default async function GeneralSettingsPage() {
  const loaded = await loadCompanySettings();
  if (!loaded.ok) {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }
  const { settings, canUpdate } = loaded;

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Datos de la empresa">
        <GeneralSettingsForm settings={settings} disabled={!canUpdate} />
      </SectionCard>
      <SectionCard title="Logo">
        <LogoUploader
          which="company"
          hasLogo={settings.hasLogo}
          version={settings.logoVersion ?? ''}
          disabled={!canUpdate}
        />
      </SectionCard>
    </div>
  );
}
