import { parseId, type Actor, type AuditState, type AuditTarget } from '../../shared';
import type { InquiryRepository } from '../domain/client.repository';
import type { Inquiry } from '../domain/inquiry';

// Lo que comparten los casos de uso de la bandeja de consultas.

export interface InquiryNotFoundError {
  readonly type: 'InquiryNotFound';
}

/** Ver la bandeja ("Ver consultas"). */
export function canReadInquiries(actor: Actor): boolean {
  return actor.can('inquiries:read');
}

/** Borrar, restaurar y asignar ("Administrar consultas"). */
export function canManageInquiries(actor: Actor): boolean {
  return actor.can('inquiries:manage');
}

/** Si ya es de un cliente, la entrada lleva su ID para poder suprimirla. */
export function inquiryTarget(action: string, inquiry: Inquiry): AuditTarget {
  const { clientId } = inquiry;
  return {
    action,
    entityType: 'inquiry',
    entityId: inquiry.id,
    clientIds: clientId === undefined ? [] : [clientId],
  };
}

/**
 * Lo que se audita al entrar una consulta. Sin los datos del remitente: hasta que se asigna no
 * tiene un cliente con el que suprimirlos.
 */
export function inquiryAuditState(inquiry: Inquiry): AuditState {
  const s = inquiry.toSnapshot();
  return {
    channel: s.channel,
    externalId: s.externalId,
    receivedAt: s.receivedAt,
    propertyId: s.propertyId,
    developmentId: s.developmentId,
    branchId: s.branchId,
    status: s.status,
    autoTags: [...s.autoTags],
  };
}

export async function findInquiry(
  repository: InquiryRepository,
  id: string,
): Promise<Inquiry | undefined> {
  const parsed = parseId<'Inquiry'>(id);
  return parsed.isOk() ? repository.findById(parsed.value) : undefined;
}

/** La misma búsqueda, bloqueando la fila: para asignarla. */
export async function findInquiryForUpdate(
  repository: InquiryRepository,
  id: string,
): Promise<Inquiry | undefined> {
  const parsed = parseId<'Inquiry'>(id);
  return parsed.isOk() ? repository.findForUpdate(parsed.value) : undefined;
}
