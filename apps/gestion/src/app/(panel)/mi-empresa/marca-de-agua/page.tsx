import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import { LogoUploader } from '../../../../features/settings/components/logo-uploader';
import { WatermarkForm } from '../../../../features/settings/components/watermark-form';
import { loadCompanySettings } from '../../../../features/settings/queries';

export const metadata: Metadata = { title: 'Marca de agua' };

export default async function WatermarkPage() {
  const loaded = await loadCompanySettings();
  if (!loaded.ok) {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }
  const { watermark } = loaded.settings;

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Logo de la marca de agua">
        <LogoUploader
          which="watermark"
          hasLogo={watermark.hasLogo}
          version={watermark.logoVersion ?? ''}
          disabled={!loaded.canUpdate}
          removable={!watermark.enabled}
        />
      </SectionCard>
      <SectionCard title="Cómo se aplica">
        {/* Con otra versión del logo o de la configuración, el formulario arranca de cero. */}
        <WatermarkForm
          key={`${watermark.logoVersion ?? ''}-${String(watermark.enabled)}`}
          watermark={watermark}
          disabled={!loaded.canUpdate}
        />
      </SectionCard>
    </div>
  );
}
