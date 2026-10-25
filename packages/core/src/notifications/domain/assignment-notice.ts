import type { NotificationType } from './notification';

/** Una asignación tal como la cuentan los eventos de clients. */
export interface Assignment {
  readonly type: NotificationType;
  readonly fromAgentId: string | undefined;
  readonly toAgentId: string | undefined;
  /** Quién asignó: falta en los eventos de antes de las notificaciones. */
  readonly assignedBy: string | undefined;
  /** La consulta que provocó la reasignación del contacto o de la oportunidad, si la hubo. */
  readonly inquiryId: string | undefined;
}

/**
 * A quién se le avisa de una asignación, o a nadie:
 *
 * - Sin agente nuevo, o con el mismo de antes (cambió solo la sucursal), no hay a quién avisar.
 * - Quien se asigna algo a sí mismo ya lo sabe.
 * - Una consulta asignada se anuncia una vez, como consulta: el contacto y la oportunidad que se
 *   reasignaron por ella no avisan aparte.
 */
export function assignmentRecipient(assignment: Assignment): string | undefined {
  const { toAgentId } = assignment;
  if (toAgentId === undefined || toAgentId === assignment.fromAgentId) return undefined;
  if (toAgentId === assignment.assignedBy) return undefined;
  if (assignment.type !== 'inquiry.assigned' && assignment.inquiryId !== undefined) {
    return undefined;
  }
  return toAgentId;
}
