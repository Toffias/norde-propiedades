// API pública del módulo audit (`@norde/core/audit`): el historial de cambios de cada entidad y el
// feed de Noticias. La escritura vive en el shared kernel (`AuditLog`, `auditUpdated`); acá, la lectura.

export * from './contracts';
export type {
  AuditHistoryCriteria,
  AuditHistoryEntry,
  AuditHistoryQuery,
} from './application/ports/audit-history-query';
export {
  NEWS_ACTION_KINDS,
  NEWS_ACTIONS,
  NEWS_ENTITY_TYPES,
  NEWS_KINDS,
  OPERATIONS_FIELD,
  PROPERTY_EDIT_ACTION,
  newsKindOf,
  type NewsEntityType,
  type NewsKind,
} from './domain/news';
export type {
  NewsCardRecord,
  NewsEntryRecord,
  NewsFeedCriteria,
  NewsFeedQuery,
  NewsScopeReader,
  NewsUserNames,
} from './application/ports/news-feed-query';
export { ListNews, type ListNewsError } from './application/queries/list-news';
