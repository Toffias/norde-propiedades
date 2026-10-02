import {
  OPPORTUNITY_STATUS_LABELS,
  type OpportunityStageRef,
  type OpportunityStatusValue,
} from '@norde/core/clients/contracts';
import { StatusPill, type StatusTone } from '@norde/ui/components/status-pill';

import { ColorDot } from './catalog-pieces';

const OPPORTUNITY_STATUS_TONES: Readonly<Record<OpportunityStatusValue, StatusTone>> = {
  new: 'green',
  contacted: 'amber',
  visiting: 'amber',
  negotiating: 'amber',
  won: 'green',
  lost: 'gray',
  referred_to_partner: 'gray',
};

/**
 * El estado de una oportunidad: el nombre y el color que le puso Norde, con la categoría en el
 * tooltip. Las anteriores al backfill (sin estado) muestran la categoría.
 */
export function OpportunityStagePill({
  stage,
  status,
}: {
  readonly stage: OpportunityStageRef | undefined;
  readonly status: OpportunityStatusValue;
}) {
  if (stage === undefined) {
    return (
      <StatusPill tone={OPPORTUNITY_STATUS_TONES[status]}>
        {OPPORTUNITY_STATUS_LABELS[status]}
      </StatusPill>
    );
  }
  return (
    <span
      title={OPPORTUNITY_STATUS_LABELS[status]}
      className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium whitespace-nowrap"
    >
      <ColorDot color={stage.color} className="h-2 w-2" />
      <span className="truncate">{stage.name}</span>
    </span>
  );
}
