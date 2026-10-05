import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import { CheckCircle2Icon } from 'lucide-react';
import type { Metadata } from 'next';

import { PortalAccounts } from '../../../../features/portals/components/portal-accounts';
import { connectionOutcomeMessage } from '../../../../features/portals/messages';
import { CONNECTION_PARAM } from '../../../../features/portals/oauth-flow';
import { loadPortalAccounts } from '../../../../features/portals/queries';
import { PortalFooterForm } from '../../../../features/settings/components/portal-footer-form';
import { loadCompanySettings } from '../../../../features/settings/queries';
import { FormAlert } from '../../../../features/shared/components/form-alert';

export const metadata: Metadata = { title: 'Portales' };

export default async function PortalsSettingsPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [loaded, accounts, params] = await Promise.all([
    loadCompanySettings(),
    loadPortalAccounts(),
    searchParams,
  ]);
  if (!loaded.ok) {
    return <ErrorState title="No podés ver esta sección" description={loaded.message} />;
  }
  const raw = params[CONNECTION_PARAM];
  const notice = connectionOutcomeMessage(typeof raw === 'string' ? raw : undefined);

  return (
    <div className="flex flex-col gap-5">
      {accounts.kind !== 'hidden' && notice !== undefined && (
        <ConnectionNotice ok={notice.ok} message={notice.message} />
      )}
      {accounts.kind === 'ok' && <PortalAccounts view={accounts.view} />}
      {accounts.kind === 'error' && <FormAlert message={accounts.message} />}
      <SectionCard title="Descripción en portales">
        <PortalFooterForm
          footer={loaded.settings.portalDescriptionFooter}
          disabled={!loaded.canUpdate}
        />
      </SectionCard>
    </div>
  );
}

function ConnectionNotice({ ok, message }: { readonly ok: boolean; readonly message: string }) {
  if (!ok) return <FormAlert message={message} />;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-md border border-success-500/30 bg-success-50 px-3 py-2 text-sm text-success-700 dark:bg-success-700/20 dark:text-success-300"
    >
      <CheckCircle2Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  );
}
