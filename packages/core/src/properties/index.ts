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

export {
  OPERATION_LABELS,
  PRICE_CURRENCIES,
  PROPERTY_KIND_LABELS,
  PROPERTY_KINDS,
  PROPERTY_OPERATIONS,
  type PriceCurrency,
  type PropertyKind,
  type PropertyOperationKind,
} from './domain/property-catalog';
export { Coordinates, type InvalidCoordinatesError } from './domain/coordinates';
export { propertySlug, suggestPortalTitle, suggestPublishAddress } from './domain/listing-text';
export {
  Property,
  type NegativePriceError,
  type PropertyAddress,
  type PropertyAlreadyDeletedError,
  type PropertyId,
  type PropertyNotDeletedError,
  type PropertyOperation,
  type PropertySnapshot,
} from './domain/property';
export type { PropertyEvent } from './domain/property.events';
export type { PropertyRepository } from './domain/property.repository';

export type {
  PanelPropertyListCriteria,
  PanelPropertyListItem,
  PanelPropertyListQuery,
  PropertyOwnerFilter,
} from './application/ports/panel-property-list-query';
export type {
  PropertiesTransaction,
  PropertiesUnitOfWork,
} from './application/ports/properties-transaction';
export type {
  ReferenceCodeAllocator,
  ReferenceCodeUnavailableError,
} from './application/ports/reference-code-allocator';
export type { UserNames } from './application/ports/user-names';
export type { InvalidInputError, PropertyNotFoundError } from './application/property-support';
export {
  CreateProperty,
  type CreatePropertyError,
  type CreatePropertyOutput,
} from './application/commands/create-property';
export { DeleteProperty, type DeletePropertyError } from './application/commands/delete-property';
export {
  RestoreProperty,
  type RestorePropertyError,
} from './application/commands/restore-property';
export {
  ListPanelProperties,
  type ListPanelPropertiesError,
} from './application/queries/list-panel-properties';
