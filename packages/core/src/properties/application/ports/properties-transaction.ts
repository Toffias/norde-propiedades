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
import type { DevelopmentUnitImportRepository } from '../../domain/development-unit-import.repository';
import type { DevelopmentRepository } from '../../domain/development.repository';
import type { FavoriteSearchRepository } from '../../domain/favorite-search';
import type { MediaItemRepository, AttachmentRepository } from '../../domain/media.repository';
import type { PropertyDocumentRepository } from '../../domain/property-document.repository';
import type { PropertyRepository } from '../../domain/property.repository';
import type { ReservationRepository } from '../../domain/reservation.repository';

/** Lo que un command de properties usa dentro de la transacción, ligado a la misma conexión. */
export interface PropertiesTransaction {
  readonly properties: PropertyRepository;
  readonly developments: DevelopmentRepository;
  readonly unitImports: DevelopmentUnitImportRepository;
  readonly locations: LocationRepository;
  readonly features: FeatureRepository;
  readonly customAttributes: CustomAttributeRepository;
  readonly tagGroups: TagGroupRepository;
  readonly tags: TagRepository;
  readonly typeSettings: PropertyTypeSettingsRepository;
  readonly settings: PropertySettingsRepository;
  readonly favoriteSearches: FavoriteSearchRepository;
  readonly media: MediaItemRepository;
  readonly attachments: AttachmentRepository;
  readonly documents: PropertyDocumentRepository;
  readonly reservations: ReservationRepository;
  readonly events: EventPublisher;
  readonly audit: AuditLog;
}

export type PropertiesUnitOfWork = UnitOfWork<PropertiesTransaction>;
