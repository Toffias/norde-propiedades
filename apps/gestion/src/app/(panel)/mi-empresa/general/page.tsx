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
    <SectionCard title="Datos de la empresa">
      <div className="flex flex-col gap-5 md:flex-row md:gap-8">
        <div className="flex shrink-0 flex-col gap-2">
          <span className="text-sm font-medium">Logo</span>
          <LogoUploader
            which="company"
            hasLogo={settings.hasLogo}
            version={settings.logoVersion ?? ''}
            disabled={!canUpdate}
          />
        </div>
        <div className="border-t border-border md:border-t-0 md:border-l" />
        <div className="min-w-0 flex-1">
          <GeneralSettingsForm settings={settings} disabled={!canUpdate} />
        </div>
      </div>
    </SectionCard>
  );
}
