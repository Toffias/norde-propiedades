import { ErrorState } from '@norde/ui/components/error-state';
import { SectionCard } from '@norde/ui/components/section-card';
import type { Metadata } from 'next';

import { getContainer } from '../../../../container';
import { CloseReasonsSettings } from '../../../../features/opportunities/components/close-reasons-settings';
import { OpportunityRulesForm } from '../../../../features/opportunities/components/opportunity-rules-form';
import { OpportunityStagesSettings } from '../../../../features/opportunities/components/opportunity-stages-settings';
import { messageForError } from '../../../../lib/errors';
import { requireSession } from '../../../../lib/session';

export const metadata: Metadata = { title: 'Configuración de oportunidades' };

export default async function OpportunitySettingsPage() {
  const { actor } = await requireSession();
  const result = await getContainer().clients.getOpportunityConfiguration.execute(actor);
  if (result.isErr()) {
    return (
      <ErrorState title="No podés ver esta sección" description={messageForError(result.error)} />
    );
  }
  const config = result.value;
  const disabled = !actor.can('settings:update');

  return (
    <div className="flex flex-col gap-5">
      <SectionCard title="Estados">
        <OpportunityStagesSettings stages={config.stages} disabled={disabled} />
      </SectionCard>
      <SectionCard title="Motivos de cierre">
        <CloseReasonsSettings reasons={config.closeReasons} disabled={disabled} />
      </SectionCard>
      <SectionCard title="Reglas automáticas">
        <OpportunityRulesForm
          key={JSON.stringify(config.rules)}
          config={config}
          disabled={disabled}
        />
      </SectionCard>
    </div>
  );
}
