import { accessScope, OWNERSHIP_RULES } from '../../identity';
import { parseId, type Actor, type AuditState, type AuditTarget } from '../../shared';
import type { QuickReplyRow } from '../contracts';
import type { QuickReplyRepository } from '../domain/client.repository';
import type { QuickReply, QuickReplySnapshot } from '../domain/quick-reply';

// Lo que comparten los casos de uso de las respuestas rápidas.

export interface QuickReplyNotFoundError {
  readonly type: 'QuickReplyNotFound';
}

/** Crear, editar, activar o borrar plantillas (Gerencia en Tokko). */
export function canManageQuickReplies(actor: Actor): boolean {
  return actor.can('quick-replies:manage');
}

/** Usar las activas al enviar: quien puede administrarlas o enviarle algo a un contacto. */
export function canUseQuickReplies(actor: Actor): boolean {
  return (
    canManageQuickReplies(actor) || accessScope(actor, OWNERSHIP_RULES.clientsUpdate) !== undefined
  );
}

export function quickReplyTarget(action: string, quickReplyId: string): AuditTarget {
  return { action, entityType: 'quick_reply', entityId: quickReplyId, clientIds: [] };
}

export function quickReplyAuditState(reply: QuickReply): AuditState {
  const s = reply.toSnapshot();
  return { name: s.name, subject: s.subject, body: s.body, isActive: s.isActive };
}

export async function findQuickReply(
  repository: QuickReplyRepository,
  id: string,
): Promise<QuickReply | undefined> {
  const parsed = parseId<'QuickReply'>(id);
  return parsed.isOk() ? repository.findById(parsed.value) : undefined;
}

export function toQuickReplyRow(s: QuickReplySnapshot): QuickReplyRow {
  return {
    id: s.id,
    name: s.name,
    subject: s.subject,
    body: s.body,
    isActive: s.isActive,
    updatedAt: s.updatedAt,
  };
}
