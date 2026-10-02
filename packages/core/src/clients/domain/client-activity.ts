import { err, ok, type Result } from '../../shared/domain/result';

import type { ClientId } from './client';
import type { OpportunitySnapshot } from './opportunity';
import type { StagePosition } from './opportunity-moves';
import type { OpportunityStatus } from './opportunity-status';

/**
 * Qué pasó con el cliente, en el timeline de su ficha. Las notas las carga un usuario; el resto lo
 * registran las reacciones a eventos (consultas, conversaciones del agente, unificaciones) y, más
 * adelante, oportunidades (#9) y envíos (#11).
 */
export const CLIENT_ACTIVITY_KINDS = [
  'note',
  'status_change',
  'listing_sent',
  'listing_viewed',
  'listing_reaction',
  'inquiry',
  'message',
  'merge',
] as const;
export type ClientActivityKind = (typeof CLIENT_ACTIVITY_KINDS)[number];

export const MAX_NOTE_LENGTH = 5000;

/** Lo propio de cada tipo. Otros registros van por ID; nada de copiar nombres ni teléfonos. */
export type ClientActivityBody =
  | { readonly kind: 'note'; readonly text: string }
  | {
      readonly kind: 'status_change';
      readonly from: OpportunityStatus | undefined;
      readonly to: OpportunityStatus;
      /** El estado editable de origen y de destino (las entradas anteriores a #9 no los tienen). */
      readonly fromStageId: string | undefined;
      readonly toStageId: string | undefined;
    }
  | {
      readonly kind: 'listing_sent';
      readonly channel: string;
      readonly propertyIds: readonly string[];
    }
  | { readonly kind: 'listing_viewed'; readonly propertyId: string | undefined }
  | {
      readonly kind: 'listing_reaction';
      readonly propertyId: string;
      readonly reaction: 'liked' | 'disliked';
    }
  | {
      readonly kind: 'inquiry';
      readonly channel: string;
      readonly type: string;
      readonly intent: string;
      readonly propertyId: string | undefined;
      readonly followUp: boolean;
      readonly note: string | undefined;
    }
  | { readonly kind: 'message'; readonly conversationId: string; readonly channel: string }
  | { readonly kind: 'merge'; readonly mergedClientId: string };

/**
 * Una entrada del timeline. Es un registro de solo inserción: no se edita (lo que cambió de un
 * cliente está en su historial de auditoría).
 */
export interface ClientActivity {
  readonly id: string;
  readonly clientId: ClientId;
  readonly opportunityId: string | undefined;
  /** Usuario (`user.id`) o actor de sistema (`system:agent-ia`). */
  readonly actorId: string;
  readonly body: ClientActivityBody;
  readonly occurredAt: Date;
}

export type NoteActivity = ClientActivity & {
  readonly body: { readonly kind: 'note'; readonly text: string };
};

export interface EmptyNoteError {
  readonly type: 'EmptyNote';
}

export interface NoteTooLongError {
  readonly type: 'NoteTooLong';
  readonly max: number;
}

/**
 * Nota de un usuario: sin espacios de más al principio ni al final, y con algo escrito. La que se
 * escribe sobre una oportunidad (desde el tablero) queda también en su historial.
 */
export function noteActivity(input: {
  readonly id: string;
  readonly clientId: ClientId;
  readonly opportunityId?: string | undefined;
  readonly text: string;
  readonly actorId: string;
  readonly now: Date;
}): Result<NoteActivity, EmptyNoteError | NoteTooLongError> {
  const text = input.text.trim().replace(/\r\n/g, '\n');
  if (text.length === 0) return err({ type: 'EmptyNote' });
  if (text.length > MAX_NOTE_LENGTH) return err({ type: 'NoteTooLong', max: MAX_NOTE_LENGTH });
  return ok({
    id: input.id,
    clientId: input.clientId,
    opportunityId: input.opportunityId,
    actorId: input.actorId,
    body: { kind: 'note', text },
    occurredAt: input.now,
  });
}

/** El principal se quedó con todo lo de otro contacto (la actividad del duplicado pasa también). */
export function mergeActivity(input: {
  readonly id: string;
  readonly clientId: ClientId;
  readonly mergedClientId: string;
  readonly actorId: string;
  readonly now: Date;
}): ClientActivity {
  return {
    id: input.id,
    clientId: input.clientId,
    opportunityId: undefined,
    actorId: input.actorId,
    body: { kind: 'merge', mergedClientId: input.mergedClientId },
    occurredAt: input.now,
  };
}

/** Una oportunidad cambió de estado (también al cerrarse): queda en el timeline del cliente. */
export function statusChangeActivity(input: {
  readonly id: string;
  readonly clientId: ClientId;
  readonly opportunityId: string;
  readonly from: StagePosition | undefined;
  readonly to: StagePosition;
  readonly actorId: string;
  readonly now: Date;
}): ClientActivity {
  return {
    id: input.id,
    clientId: input.clientId,
    opportunityId: input.opportunityId,
    actorId: input.actorId,
    body: {
      kind: 'status_change',
      from: input.from?.status,
      to: input.to.status,
      fromStageId: input.from?.stageId,
      toStageId: input.to.stageId,
    },
    occurredAt: input.now,
  };
}

/** Los canales en los que atiende el agente de IA: lo que entra por ahí lo registró él. */
const AGENT_CHANNELS: readonly string[] = ['whatsapp', 'web_chat'];

/** Actor de sistema que registró una consulta, según el canal por el que entró. */
export function inquiryActorId(channel: string): string {
  return AGENT_CHANNELS.includes(channel) ? 'system:agent-ia' : 'system:portal-sync';
}

/**
 * Una consulta: abrió una oportunidad o volvió a consultar por una abierta (`followUp`). La nota es
 * lo último que pidió.
 */
export function inquiryActivity(input: {
  readonly id: string;
  readonly opportunity: OpportunitySnapshot;
  readonly followUp: boolean;
  readonly occurredAt: Date;
}): ClientActivity {
  const { opportunity } = input;
  return {
    id: input.id,
    clientId: opportunity.clientId,
    opportunityId: opportunity.id,
    actorId: inquiryActorId(opportunity.originChannel),
    body: {
      kind: 'inquiry',
      channel: opportunity.originChannel,
      type: opportunity.type,
      intent: opportunity.intent,
      propertyId: opportunity.propertyId,
      followUp: input.followUp,
      note: opportunity.notes.at(-1)?.text,
    },
    occurredAt: input.occurredAt,
  };
}

/** Una conversación del agente de IA que quedó vinculada al cliente. */
export function conversationActivity(input: {
  readonly id: string;
  readonly clientId: ClientId;
  readonly conversationId: string;
  readonly channel: string;
  readonly occurredAt: Date;
}): ClientActivity {
  return {
    id: input.id,
    clientId: input.clientId,
    opportunityId: undefined,
    actorId: 'system:agent-ia',
    body: { kind: 'message', conversationId: input.conversationId, channel: input.channel },
    occurredAt: input.occurredAt,
  };
}
