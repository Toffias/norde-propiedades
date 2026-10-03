import type { MediaItem, MediaItemId } from './media-item';
import type { MediaOwner } from './media-owner';
import type { Attachment, AttachmentId } from './attachment';

export interface MediaItemRepository {
  findById(id: MediaItemId): Promise<MediaItem | undefined>;
  /**
   * Toda la galería de una propiedad o un emprendimiento, en orden: la usan reordenar y elegir la
   * portada. Está acotada por `MAX_MEDIA_PER_OWNER`.
   */
  listForOwner(owner: MediaOwner): Promise<readonly MediaItem[]>;
  count(owner: MediaOwner): Promise<number>;
  /** La posición que sigue a la última de la galería. */
  nextPosition(owner: MediaOwner): Promise<number>;
  save(item: MediaItem, actorId: string): Promise<void>;
  delete(id: MediaItemId): Promise<void>;
}

export interface AttachmentRepository {
  /** También los borrados. */
  findById(id: AttachmentId): Promise<Attachment | undefined>;
  save(attachment: Attachment, actorId: string): Promise<void>;
}
