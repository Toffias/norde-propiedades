import type { MediaItem, MediaItemId } from './media-item';
import type { PropertyId } from './property';
import type { PropertyAttachment, PropertyAttachmentId } from './property-attachment';

export interface MediaItemRepository {
  findById(id: MediaItemId): Promise<MediaItem | undefined>;
  /**
   * Toda la galería de una propiedad, en orden: la usan reordenar y elegir la portada. Está acotada
   * por `MAX_MEDIA_PER_PROPERTY`.
   */
  listForProperty(propertyId: PropertyId): Promise<readonly MediaItem[]>;
  count(propertyId: PropertyId): Promise<number>;
  /** La posición que sigue a la última de la galería. */
  nextPosition(propertyId: PropertyId): Promise<number>;
  save(item: MediaItem, actorId: string): Promise<void>;
  delete(id: MediaItemId): Promise<void>;
}

export interface PropertyAttachmentRepository {
  /** También los borrados. */
  findById(id: PropertyAttachmentId): Promise<PropertyAttachment | undefined>;
  save(attachment: PropertyAttachment, actorId: string): Promise<void>;
}
