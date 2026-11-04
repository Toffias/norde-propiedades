import { toAuditValue, type AuditState } from '../../shared';
import type { FollowUpFrequency } from '../domain/follow-up-frequency';
import type { SearchSubscription } from '../domain/search-subscription';

// Lo que comparten los casos de uso de la suscripción a búsquedas desde la web (#208).

const FREQUENCY_LABELS: Readonly<Record<FollowUpFrequency, string>> = {
  daily: 'una vez por día',
  every_3_days: 'cada 3 días',
  weekly: 'una vez por semana',
  monthly: 'una vez por mes',
};

/** "cada 3 días", para el email de confirmación. */
export function frequencyLabel(frequency: FollowUpFrequency): string {
  return FREQUENCY_LABELS[frequency];
}

/** Lo que se audita de una suscripción: los criterios crudos, nunca el nombre ni el email. */
export function searchSubscriptionAuditState(subscription: SearchSubscription): AuditState {
  const c = subscription.criteria;
  const list = (items: readonly string[]) => (items.length === 0 ? undefined : toAuditValue(items));
  return {
    frequency: subscription.frequency,
    operation: c.operation,
    propertyTypes: list(c.propertyTypes),
    currency: c.currency,
    minPriceCents: c.minPriceCents,
    maxPriceCents: c.maxPriceCents,
    locationIds: list(c.locationIds),
    minRooms: c.minRooms,
  };
}
