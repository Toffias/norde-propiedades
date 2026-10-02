// API pública del módulo properties (`@norde/core/properties`).

export * from './contracts';
export {
  MANUAL_STATUSES,
  PROPERTY_STATUSES,
  PUBLICLY_LISTED_STATUSES,
  canTransition,
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
  Location,
  LOCATION_KINDS,
  LOCATION_KIND_LABELS,
  childKind,
  type LocationId,
  type LocationKind,
  type LocationParent,
  type LocationSnapshot,
  type LocationTooDeepError,
} from './domain/location';
export {
  Feature,
  FEATURE_KINDS,
  featureKey,
  type FeatureId,
  type FeatureKind,
  type FeatureSnapshot,
} from './domain/feature';
export {
  PropertyTag,
  TagGroup,
  type TagGroupId,
  type TagGroupSnapshot,
  type TagId,
  type TagSnapshot,
} from './domain/property-tag';
export {
  PROPERTY_ATTRIBUTE_GROUP,
  PROPERTY_ATTRIBUTE_GROUPS,
  PROPERTY_ATTRIBUTE_KEYS,
  RECOMMENDED_ATTRIBUTES,
  changeTypeSetting,
  defaultTypeSetting,
  ensureTypeEnabled,
  normalizeAttributes,
  type NoPropertyTypeEnabledError,
  type PropertyAttribute,
  type PropertyAttributeGroup,
  type PropertyTypeDisabledError,
  type PropertyTypeSetting,
} from './domain/property-type-settings';
export {
  DEFAULT_GRID_COLUMNS,
  GRID_COLUMN_OPTIONS,
  MAX_GRID_COLUMNS,
  chooseGridColumns,
  type GridColumn,
  type TooManyGridColumnsError,
} from './domain/grid-columns';
export {
  FavoriteSearch,
  MAX_FAVORITE_SEARCHES,
  type FavoriteSearchId,
  type FavoriteSearchRepository,
  type FavoriteSearchSnapshot,
  type TooManyFavoriteSearchesError,
} from './domain/favorite-search';
export type {
  FeatureRepository,
  LocationRepository,
  PropertySettingsRepository,
  PropertyTypeSettingsRepository,
  TagGroupRepository,
  TagRepository,
} from './domain/catalog.repository';
export {
  Property,
  type InvalidStatusTransitionError,
  type NegativePriceError,
  type OperationNotFoundError,
  type PriceChange,
  type PropertyInTrashError,
  type StatusNotManualError,
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
  BoundingBox,
  PanelPropertyFilterCriteria,
  PanelPropertyListCriteria,
  PanelPropertyListItem,
  PanelPropertyListQuery,
  PropertyOwnerFilter,
} from './application/ports/panel-property-list-query';
export type { PropertyCatalogQuery } from './application/ports/property-catalog-query';
export type {
  Geocoder,
  GeocodingFailedError,
  GeocodingRequest,
} from './application/ports/geocoder';
export type { ExportFile, PropertyExportWriter } from './application/ports/property-export-writer';
export type * from './application/catalog-support';
export type { NoBranchAssignedError } from './application/panel-filter';
export type {
  PropertiesTransaction,
  PropertiesUnitOfWork,
} from './application/ports/properties-transaction';
export type {
  ReferenceCodeAllocator,
  ReferenceCodeUnavailableError,
} from './application/ports/reference-code-allocator';
export type { Producers, UserNames } from './application/ports/user-names';
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
export { GetPropertyMap, type GetPropertyMapError } from './application/queries/get-property-map';
export {
  CompareProperties,
  type ComparePropertiesError,
} from './application/queries/compare-properties';
export { SearchLocations, type SearchLocationsError } from './application/queries/search-locations';
export { ListFeatures, type ListFeaturesError } from './application/queries/list-features';
export { ListTagGroups, type ListTagGroupsError } from './application/queries/list-tag-groups';
export { SearchTags, type SearchTagsError } from './application/queries/search-tags';
export {
  ListFavoriteSearches,
  type ListFavoriteSearchesError,
} from './application/queries/list-favorite-searches';
export {
  GetPropertyConfiguration,
  type PropertyConfiguration,
} from './application/queries/get-property-configuration';

export { CreateLocation, type CreateLocationError } from './application/commands/create-location';
export { RenameLocation, type RenameLocationError } from './application/commands/rename-location';
export { CreateFeature, type CreateFeatureError } from './application/commands/create-feature';
export { UpdateFeature, type UpdateFeatureError } from './application/commands/update-feature';
export { CreateTagGroup, type CreateTagGroupError } from './application/commands/create-tag-group';
export { RenameTagGroup, type RenameTagGroupError } from './application/commands/rename-tag-group';
export { DeleteTagGroup, type DeleteTagGroupError } from './application/commands/delete-tag-group';
export { CreateTag, type CreateTagError } from './application/commands/create-tag';
export { UpdateTag, type UpdateTagError } from './application/commands/update-tag';
export { DeleteTag, type DeleteTagError } from './application/commands/delete-tag';
export {
  UpdatePropertyTypeSetting,
  type UpdatePropertyTypeSettingError,
} from './application/commands/update-property-type-setting';
export {
  PROPERTY_SETTINGS_AUDIT_ID,
  UpdateGridColumns,
  type UpdateGridColumnsError,
} from './application/commands/update-grid-columns';
export {
  SaveFavoriteSearch,
  type SaveFavoriteSearchError,
} from './application/commands/save-favorite-search';
export {
  DeleteFavoriteSearch,
  type DeleteFavoriteSearchError,
} from './application/commands/delete-favorite-search';
export {
  BulkEditProperties,
  type BulkEditPropertiesError,
} from './application/commands/bulk-edit-properties';
export {
  ExportProperties,
  type ExportPropertiesError,
} from './application/commands/export-properties';

// ---------- Ficha de propiedad (#6) ----------

export {
  CONDITIONS,
  CUSTOM_ATTRIBUTE_KINDS,
  DISPOSITIONS,
  ORIENTATIONS,
  type Condition,
  type CoveredExceedsTotalError,
  type CustomAttributeDefinition,
  type CustomAttributeEntry,
  type CustomAttributeKind,
  type CustomAttributeNotFoundError,
  type CustomAttributeValue,
  type DealAttributes,
  type Disposition,
  type InternalInfo,
  type InvalidCustomAttributeValueError,
  type NegativeCharacteristicError,
  type Orientation,
  type PropertyCharacteristics,
  type Publication,
} from './domain/property-details';
export {
  CustomAttribute,
  type CustomAttributeId,
  type CustomAttributeSnapshot,
  type InvalidCustomAttributeOptionsError,
} from './domain/custom-attribute';
export type { CustomAttributeRepository } from './domain/catalog.repository';
export type {
  InvalidCommissionError,
  InvalidOperationsError,
  InvalidReferenceCodeError,
  OperationInput,
} from './domain/property';
export type { EditPropertyError } from './application/property-support';
export {
  UpdatePropertyLocation,
  type UpdatePropertyLocationError,
  type UpdatePropertyLocationOutput,
} from './application/commands/update-property-location';
export {
  ChangePropertyCode,
  type ChangePropertyCodeError,
  type ReferenceCodeTakenError,
} from './application/commands/change-property-code';
export {
  UpdatePropertyOperations,
  type UpdatePropertyOperationsError,
} from './application/commands/update-property-operations';
export {
  ChangePropertyStatus,
  type ChangePropertyStatusError,
} from './application/commands/change-property-status';
export {
  UpdatePropertyCharacteristics,
  type UpdatePropertyCharacteristicsError,
} from './application/commands/update-property-characteristics';
export {
  UpdatePropertyDeal,
  type UpdatePropertyDealError,
} from './application/commands/update-property-deal';
export {
  UpdatePropertyFeatures,
  type UpdatePropertyFeaturesError,
} from './application/commands/update-property-features';
export {
  UpdatePropertyDescription,
  type UpdatePropertyDescriptionError,
} from './application/commands/update-property-description';
export {
  UpdatePropertyCustomAttributes,
  type UpdatePropertyCustomAttributesError,
} from './application/commands/update-property-custom-attributes';
export {
  ChangePropertyTags,
  type ChangePropertyTagsError,
} from './application/commands/change-property-tags';
export {
  ChangePropertyProducer,
  type ChangePropertyProducerError,
  type ProducerNotFoundError,
} from './application/commands/change-property-producer';
export {
  UpdatePropertyInternalInfo,
  type UpdatePropertyInternalInfoError,
  type UserNotFoundError,
} from './application/commands/update-property-internal-info';
export {
  UpdatePropertyPublication,
  type UpdatePropertyPublicationError,
} from './application/commands/update-property-publication';
export {
  CreateCustomAttribute,
  type CreateCustomAttributeError,
  type CustomAttributeNameTakenError,
} from './application/commands/create-custom-attribute';
export {
  UpdateCustomAttribute,
  type UpdateCustomAttributeError,
} from './application/commands/update-custom-attribute';

// ---------- Multimedia y archivos (#6) ----------

export {
  MAX_MEDIA_BYTES,
  MAX_MEDIA_PER_PROPERTY,
  MEDIA_IMAGE_TYPES,
  MEDIA_KINDS,
  MEDIA_PROCESSING_STATUSES,
  MEDIA_ROTATIONS,
  MediaItem,
  type InvalidMediaUrlError,
  type MediaDeleted,
  type MediaEvent,
  type MediaItemId,
  type MediaItemSnapshot,
  type MediaKind,
  type MediaProcessingStatus,
  type MediaRotation,
  type MediaTooLargeError,
  type MediaVariants,
  type MediaVariantsRequested,
  type NotAnImageError,
  type UnsupportedMediaTypeError,
} from './domain/media-item';
export {
  ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  PropertyAttachment,
  type AttachmentTooLargeError,
  type InvalidAttachmentNameError,
  type PropertyAttachmentId,
  type PropertyAttachmentSnapshot,
  type UnsupportedAttachmentTypeError,
} from './domain/property-attachment';
export type { MediaItemRepository, PropertyAttachmentRepository } from './domain/media.repository';
export type {
  ImageVariantGenerator,
  ImageVariants,
  InvalidImageError as InvalidPropertyImageError,
} from './application/ports/image-variant-generator';
export type {
  PropertyAttachmentCriteria,
  PropertyMediaCriteria,
  PropertyMediaQuery,
} from './application/ports/property-media-query';
export type {
  AttachmentNotFoundError,
  MediaNotFoundError,
  TooManyMediaError,
} from './application/media-support';
export {
  UploadPropertyMedia,
  type UploadPropertyMediaError,
} from './application/commands/upload-property-media';
export {
  AddPropertyMediaLink,
  type AddPropertyMediaLinkError,
} from './application/commands/add-property-media-link';
export {
  UpdatePropertyMedia,
  type UpdatePropertyMediaError,
} from './application/commands/update-property-media';
export {
  ReorderPropertyMedia,
  type InvalidMediaOrderError,
  type ReorderPropertyMediaError,
} from './application/commands/reorder-property-media';
export {
  SetPropertyCover,
  type SetPropertyCoverError,
} from './application/commands/set-property-cover';
export {
  DeletePropertyMedia,
  type DeletePropertyMediaError,
} from './application/commands/delete-property-media';
export {
  GeneratePropertyMediaVariants,
  type GeneratePropertyMediaVariantsError,
  type MediaProcessingOutcome,
} from './application/commands/generate-property-media-variants';
export {
  DeleteStoredMediaFiles,
  type DeleteStoredMediaFilesError,
} from './application/commands/delete-stored-media-files';
export {
  UploadPropertyAttachment,
  type UploadPropertyAttachmentError,
} from './application/commands/upload-property-attachment';
export {
  UpdatePropertyAttachment,
  type UpdatePropertyAttachmentError,
} from './application/commands/update-property-attachment';
export {
  DeletePropertyAttachment,
  type DeletePropertyAttachmentError,
} from './application/commands/delete-property-attachment';
export {
  ListPropertyMedia,
  type ListPropertyMediaError,
} from './application/queries/list-property-media';
export {
  ListPropertyAttachments,
  type ListPropertyAttachmentsError,
} from './application/queries/list-property-attachments';
export {
  GetPropertyMediaFile,
  type GetPropertyMediaFileError,
} from './application/queries/get-property-media-file';
export {
  GetPropertyAttachmentDownload,
  type GetPropertyAttachmentDownloadError,
} from './application/queries/get-property-attachment-download';

// ---------- Ficha: lectura, historial y documentos (#6) ----------

export {
  PROPERTY_DOCUMENT_KINDS,
  PROPERTY_DOCUMENT_STATUSES,
  PropertyDocument,
  pdfAddress,
  pdfPrices,
  type DocumentNotReadyError,
  type PdfAddressDisplay,
  type PdfPrice,
  type PropertyDocumentId,
  type PropertyDocumentKind,
  type PropertyDocumentRequested,
  type PropertyDocumentSnapshot,
  type PropertyDocumentStatus,
  type ReportPeriod,
  type ReportPeriodRequiredError,
} from './domain/property-document';
export type { PropertyDocumentRepository } from './domain/property-document.repository';
export type { PropertyDetailLookups } from './application/ports/property-detail-lookups';
export type {
  OwnerReports,
  PropertyDocumentContent,
  PropertyDocumentQuery,
  PropertyDocumentRenderer,
} from './application/ports/property-documents';
export {
  GetPanelPropertyDetail,
  buildPanelPropertyDetail,
  type GetPanelPropertyDetailError,
} from './application/queries/get-panel-property-detail';
export {
  ListPropertyHistory,
  type ListPropertyHistoryError,
} from './application/queries/list-property-history';
export {
  GetPropertyInterestProfile,
  type GetPropertyInterestProfileError,
} from './application/queries/get-property-interest-profile';
export {
  RequestPropertyDocument,
  type RequestPropertyDocumentError,
} from './application/commands/request-property-document';
export {
  RenderPropertyDocument,
  type DocumentRenderOutcome,
  type RenderPropertyDocumentError,
} from './application/commands/render-property-document';
export {
  SendOwnerReport,
  type DocumentNotFoundError,
  type SendOwnerReportError,
} from './application/commands/send-owner-report';
export {
  ListPropertyDocuments,
  type ListPropertyDocumentsError,
} from './application/queries/list-property-documents';
export {
  GetPropertyDocumentDownload,
  type GetPropertyDocumentDownloadError,
} from './application/queries/get-property-document-download';
export {
  ListCustomAttributes,
  type ListCustomAttributesError,
} from './application/queries/list-custom-attributes';

// ---------- Propiedades en la ficha de un contacto (#8) ----------

export {
  ListOwnedProperties,
  type ListOwnedPropertiesError,
} from './application/queries/list-owned-properties';
export {
  GetPropertySummaries,
  type GetPropertySummariesError,
} from './application/queries/get-property-summaries';
