// API pública del módulo properties (`@norde/core/properties`).

export * from './contracts';
export {
  PROPERTY_STATUSES,
  PUBLICLY_LISTED_STATUSES,
  type PropertyStatus,
} from './domain/property-status';
export type {
  PropertyRecord,
  PropertySearchCriteria,
  PropertySearchQuery,
} from './application/ports/property-search-query';
export {
  GetPropertyDetail,
  type GetPropertyDetailError,
} from './application/queries/get-property-detail';
export {
  SearchProperties,
  type SearchPropertiesError,
} from './application/queries/search-properties';
