import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import {
  EmailSenderForm,
  TestEmailForm,
} from '../../../../features/settings/components/email-settings-form';
import { loadCompanySettings } from '../../../../features/settings/queries';

export const metadata: Metadata = { title: 'Email' };

export default async function EmailSettingsPage() {
  const loaded = await loadCompanySettings();
  if (!loaded.ok) {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Remitente de los emails">
        <EmailSenderForm sender={loaded.settings.emailSender} disabled={!loaded.canUpdate} />
      </SectionCard>
      <SectionCard title="Probar el envío">
        <div className="flex flex-col gap-3">
          <p className="text-sm leading-normal text-muted-foreground">
            Los emails salen por Resend, con la dirección y la clave que se configuran en el
            servidor. Mandá una prueba para verificar que llegan.
          </p>
          <TestEmailForm disabled={!loaded.canUpdate} />
        </div>
      </SectionCard>
    </div>
  );
}
