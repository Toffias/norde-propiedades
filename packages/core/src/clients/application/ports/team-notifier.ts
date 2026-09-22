import type { ContactChannel } from '../../domain/contact-channel';
import type { OpportunityIntent, OpportunityType } from '../../domain/opportunity';
import type { OpportunityStatus } from '../../domain/opportunity-status';

export interface OpportunityNotification {
  /** `new`: oportunidad nueva. `follow_up`: el cliente volvió a consultar. */
  readonly kind: 'new' | 'follow_up';
  readonly opportunityId: string;
  readonly clientId: string;
  readonly clientName: string | undefined;
  readonly phone: string | undefined;
  readonly email: string | undefined;
  readonly channel: ContactChannel;
  readonly type: OpportunityType;
  readonly intent: OpportunityIntent;
  readonly status: OpportunityStatus;
  readonly propertyId: string | undefined;
  readonly latestNote: string | undefined;
  readonly occurredAt: Date;
}

/**
 * Avisa al equipo comercial (webhook, mail, panel). Si falla, lanza: el job se reintenta.
 */
export interface TeamNotifier {
  notifyOpportunity(notification: OpportunityNotification): Promise<void>;
}
