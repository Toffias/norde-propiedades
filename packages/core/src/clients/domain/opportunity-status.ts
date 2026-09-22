import { err, ok, type Result } from '../../shared/domain/result';

export const OPPORTUNITY_STATUSES = [
  'new',
  'contacted',
  'visiting',
  'negotiating',
  'won',
  'lost',
  /** "Aplica a otra inmobiliaria": Norde no tiene hoy qué ofrecerle; se revisan inmobiliarias socias. */
  'referred_to_partner',
] as const;

export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

const TRANSITIONS: Readonly<Record<OpportunityStatus, readonly OpportunityStatus[]>> = {
  new: ['contacted', 'visiting', 'referred_to_partner', 'lost'],
  contacted: ['visiting', 'negotiating', 'referred_to_partner', 'lost'],
  visiting: ['contacted', 'negotiating', 'won', 'lost'],
  negotiating: ['visiting', 'won', 'lost'],
  // Si entra stock que coincide con su búsqueda, vuelve a "nuevo".
  referred_to_partner: ['new', 'contacted', 'lost'],
  won: [],
  lost: [],
};

export interface InvalidStatusTransitionError {
  readonly type: 'InvalidStatusTransition';
  readonly from: OpportunityStatus;
  readonly to: OpportunityStatus;
}

export function canTransition(from: OpportunityStatus, to: OpportunityStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function checkTransition(
  from: OpportunityStatus,
  to: OpportunityStatus,
): Result<void, InvalidStatusTransitionError> {
  return canTransition(from, to)
    ? ok(undefined)
    : err({ type: 'InvalidStatusTransition', from, to });
}

/** Ganada y perdida cierran la oportunidad; el resto sigue abierta. */
export function isOpenStatus(status: OpportunityStatus): boolean {
  return status !== 'won' && status !== 'lost';
}
