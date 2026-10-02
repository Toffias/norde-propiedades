import {
  CONTACT_CHANNEL_LABELS,
  OPPORTUNITY_INTENT_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  OPPORTUNITY_TYPE_LABELS,
  type ClientActivityActor,
  type ClientActivityRow,
  type ClientListingOperation,
} from '@norde/core/clients/contracts';
import {
  CURRENCIES,
  OPERATIONS,
  type Currency,
  type Operation,
} from '@norde/core/properties/contracts';

import { EMPTY_VALUE, formatMoney } from '../../lib/format';
import { OPERATION_LABELS } from '../properties/labels';

// Cómo se muestra la actividad de un contacto y lo que se le ofrece en su ficha.

export function activityActorName(actor: ClientActivityActor): string {
  switch (actor.kind) {
    case 'agent':
      return 'El agente de IA';
    case 'system':
      return 'El sistema';
    case 'user':
      return actor.name ?? 'Un usuario inactivo';
  }
}

export function channelLabel(channel: string): string | undefined {
  return CONTACT_CHANNEL_LABELS[channel];
}

const REACTION_LABELS = { liked: 'Le gustó', disliked: 'No le gustó' } as const;

export function reactionLabel(reaction: 'liked' | 'disliked'): string {
  return REACTION_LABELS[reaction];
}

/** El título de una entrada del timeline: "Consultó por WhatsApp", "Nota". */
export function activityTitle(entry: ClientActivityRow): string {
  switch (entry.kind) {
    case 'note':
      return 'Nota';
    case 'status_change':
      return `Pasó a "${entry.toStage?.name ?? OPPORTUNITY_STATUS_LABELS[entry.to]}"`;
    case 'listing_sent': {
      const channel = channelLabel(entry.channel);
      const count = entry.propertyIds.length;
      const what = count === 1 ? 'una propiedad' : `${count.toLocaleString('es-AR')} propiedades`;
      return channel === undefined
        ? `Se le enviaron ${what}`
        : `Se le enviaron ${what} por ${channel}`;
    }
    case 'listing_viewed':
      return 'Vio una propiedad';
    case 'listing_reaction':
      return reactionLabel(entry.reaction);
    case 'inquiry': {
      const channel = channelLabel(entry.channel);
      const verb = entry.followUp ? 'Volvió a consultar' : 'Consultó';
      return channel === undefined ? verb : `${verb} por ${channel}`;
    }
    case 'message': {
      const channel = channelLabel(entry.channel);
      return channel === undefined
        ? 'Conversó con el agente de IA'
        : `Conversó con el agente de IA por ${channel}`;
    }
    case 'merge':
      return 'Se unificó otro contacto en este';
  }
}

/** Lo que pidió en una consulta: "Compra · Pidió una visita". */
export function inquirySummary(type: string, intent: string): string {
  return [OPPORTUNITY_TYPE_LABELS[type], OPPORTUNITY_INTENT_LABELS[intent]]
    .filter((part) => part !== undefined)
    .join(' · ');
}

function isCurrency(value: string): value is Currency {
  return CURRENCIES.some((currency) => currency === value);
}

function isOperation(value: string): value is Operation {
  return OPERATIONS.some((operation) => operation === value);
}

/** "Venta US$ 120.000 · Alquiler $ 850.000", o "Consultar" sin precio. */
export function listingPrice(operations: readonly ClientListingOperation[]): string {
  if (operations.length === 0) return EMPTY_VALUE;
  return operations
    .map((operation) => {
      const label = isOperation(operation.operation)
        ? OPERATION_LABELS[operation.operation]
        : operation.operation;
      const price =
        operation.priceCents === null || !isCurrency(operation.currency)
          ? 'Consultar'
          : formatMoney({ amountCents: operation.priceCents, currency: operation.currency });
      return `${label} ${price}`;
    })
    .join(' · ');
}
