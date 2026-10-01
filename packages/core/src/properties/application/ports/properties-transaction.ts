import type { AuditLog, EventPublisher, UnitOfWork } from '../../../shared';
import type {
  CustomAttributeRepository,
  FeatureRepository,
  LocationRepository,
  PropertySettingsRepository,
  PropertyTypeSettingsRepository,
  TagGroupRepository,
  TagRepository,
} from '../../domain/catalog.repository';
import type { FavoriteSearchRepository } from '../../domain/favorite-search';
import type {
  MediaItemRepository,
  PropertyAttachmentRepository,
} from '../../domain/media.repository';
import type { PropertyDocumentRepository } from '../../domain/property-document.repository';
import type { PropertyRepository } from '../../domain/property.repository';

/** Lo que un command de properties usa dentro de la transacción, ligado a la misma conexión. */
export interface PropertiesTransaction {
  readonly properties: PropertyRepository;
  readonly locations: LocationRepository;
  readonly features: FeatureRepository;
  readonly customAttributes: CustomAttributeRepository;
  readonly tagGroups: TagGroupRepository;
  readonly tags: TagRepository;
  readonly typeSettings: PropertyTypeSettingsRepository;
  readonly settings: PropertySettingsRepository;
  readonly favoriteSearches: FavoriteSearchRepository;
  readonly media: MediaItemRepository;
  readonly attachments: PropertyAttachmentRepository;
  readonly documents: PropertyDocumentRepository;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type PropertiesUnitOfWork = UnitOfWork<PropertiesTransaction>;
