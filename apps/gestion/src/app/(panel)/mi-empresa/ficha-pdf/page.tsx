import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import { PdfOptionsForm } from '../../../../features/settings/components/pdf-options-form';
import { loadCompanySettings } from '../../../../features/settings/queries';

export const metadata: Metadata = { title: 'Ficha y PDF' };

export default async function PdfSettingsPage() {
  const loaded = await loadCompanySettings();
  if (!loaded.ok) {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }

  return (
    <SectionCard title="Qué muestra la ficha y el PDF">
      <PdfOptionsForm options={loaded.settings.pdfOptions} disabled={!loaded.canUpdate} />
    </SectionCard>
  );
}
