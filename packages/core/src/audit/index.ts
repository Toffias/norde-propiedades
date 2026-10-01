// API pública del módulo audit (`@norde/core/audit`): el historial de cambios de cada entidad.
// La escritura vive en el shared kernel (`AuditLog`, `auditUpdated`); acá, la lectura.

export * from './contracts';
export type {
  AuditHistoryCriteria,
  AuditHistoryEntry,
  AuditHistoryQuery,
} from './application/ports/audit-history-query';
