/**
 * Quién hizo una asignación y por qué. Viaja en los eventos de reasignación para que las
 * notificaciones no le avisen a quien se asignó a sí mismo, y para que una consulta asignada se
 * anuncie una sola vez (como consulta, no también como contacto y como oportunidad).
 */
export interface AssignmentOrigin {
  /** El usuario o actor de sistema (`system:scheduler`) que asignó. */
  readonly by: string;
  /** La consulta que la provocó, si fue al asignar una consulta. */
  readonly inquiryId?: string | undefined;
}
