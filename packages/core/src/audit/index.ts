// API pública del módulo audit (`@norde/core/audit`): el historial de cambios de cada entidad y el
// feed de Noticias. La escritura vive en el shared kernel (`AuditLog`, `auditUpdated`); acá, la lectura.

export * from './contracts';
export type {
  AuditHistoryCriteria,
  AuditHistoryEntry,
  AuditHistoryQuery,
} from './application/ports/audit-history-query';
export type {
  ActorActivityCriteria,
  ActorActivityQuery,
  ActorActivityRecord,
} from './application/ports/actor-activity-query';
export {
  ACTIVITY_AREA_ENTITY_TYPES,
  ACTIVITY_AREAS,
  activityAreaOf,
  activityEntityTypes,
  type ActivityArea,
  type ActivityEntityTypeFilter,
} from './domain/activity';
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
  NewsActivityCriteria,
  NewsCardRecord,
  NewsDayRange,
  NewsEntryRecord,
  NewsFeedCriteria,
  NewsFeedQuery,
  NewsScopeReader,
  NewsUserNames,
} from './application/ports/news-feed-query';
export { ListNews, type ListNewsError } from './application/queries/list-news';
export {
  GetNewsActivity,
  type GetNewsActivityError,
} from './application/queries/get-news-activity';
export { ListMyActivity, type ListMyActivityError } from './application/queries/list-my-activity';
