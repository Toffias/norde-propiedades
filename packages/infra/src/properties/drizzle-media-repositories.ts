import {
  MAX_MEDIA_PER_PROPERTY,
  MEDIA_KINDS,
  MEDIA_PROCESSING_STATUSES,
  MEDIA_ROTATIONS,
  MediaItem,
  PropertyAttachment,
  type MediaItemId,
  type MediaItemRepository,
  type PropertyAttachmentId,
  type PropertyAttachmentRepository,
  type PropertyId,
} from '@norde/core/properties';
import { parseId, type Result } from '@norde/core/shared';
import { asc, count, eq, max } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { attachments, mediaItems } from '../db/schema';

// Repositorios de la galería y los archivos de la ficha. Solo mapean filas y aggregates.

const MediaRow = z.object({
  kind: z.enum(MEDIA_KINDS),
  processingStatus: z.enum(MEDIA_PROCESSING_STATUSES),
  rotation: z.union(MEDIA_ROTATIONS.map((value) => z.literal(value))),
});
const VariantsSchema = z.object({
  thumbnail: z.string().optional(),
  web: z.string().optional(),
  watermarked: z.string().optional(),
});

function stored<T, E>(result: Result<T, E>): T {
  if (result.isErr()) throw new Error('Invalid value stored in the media tables');
  return result.value;
}

function isLink(kind: string): boolean {
  return kind === 'video' || kind === 'tour_360';
}

function toMediaItem(row: typeof mediaItems.$inferSelect): MediaItem {
  const parsed = MediaRow.parse(row);
  const variants = VariantsSchema.parse(row.variants);
  if (row.propertyId === null) throw new Error('A media item of a development is not a property');
  return MediaItem.restore({
    id: stored(parseId<'MediaItem'>(row.id)),
    propertyId: stored(parseId<'Property'>(row.propertyId)),
    kind: parsed.kind,
    storageKey: row.storageKey ?? undefined,
    // Los links guardan la URL externa; las fotos, la clave de la original (la columna es NOT NULL).
    externalUrl: isLink(parsed.kind) ? row.url : undefined,
    contentType: row.contentType ?? undefined,
    position: row.position,
    isCover: row.isCover,
    showOnWeb: row.showOnWeb,
    includeInPdf: row.includeInPdf,
    rotation: parsed.rotation,
    description: row.description ?? undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    sizeBytes: row.sizeBytes ?? undefined,
    variants: {
      ...(variants.thumbnail === undefined ? {} : { thumbnail: variants.thumbnail }),
      ...(variants.web === undefined ? {} : { web: variants.web }),
      ...(variants.watermarked === undefined ? {} : { watermarked: variants.watermarked }),
    },
    processing: parsed.processingStatus,
    processingError: row.processingError ?? undefined,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

export class DrizzleMediaItemRepository implements MediaItemRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: MediaItemId): Promise<MediaItem | undefined> {
    const [row] = await this.db.select().from(mediaItems).where(eq(mediaItems.id, id)).limit(1);
    return row ? toMediaItem(row) : undefined;
  }

  async listForProperty(propertyId: PropertyId): Promise<readonly MediaItem[]> {
    const rows = await this.db
      .select()
      .from(mediaItems)
      .where(eq(mediaItems.propertyId, propertyId))
      .orderBy(asc(mediaItems.position), asc(mediaItems.id))
      .limit(MAX_MEDIA_PER_PROPERTY);
    return rows.map(toMediaItem);
  }

  async count(propertyId: PropertyId): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(mediaItems)
      .where(eq(mediaItems.propertyId, propertyId));
    return row?.total ?? 0;
  }

  async nextPosition(propertyId: PropertyId): Promise<number> {
    const [row] = await this.db
      .select({ last: max(mediaItems.position) })
      .from(mediaItems)
      .where(eq(mediaItems.propertyId, propertyId));
    return row?.last === null || row?.last === undefined ? 0 : row.last + 1;
  }

  async save(item: MediaItem, actorId: string): Promise<void> {
    const s = item.toSnapshot();
    const values = {
      kind: s.kind,
      position: s.position,
      isCover: s.isCover,
      showOnWeb: s.showOnWeb,
      includeInPdf: s.includeInPdf,
      rotation: s.rotation,
      description: s.description ?? null,
      width: s.width ?? null,
      height: s.height ?? null,
      variants: s.variants,
      processingStatus: s.processing,
      processingError: s.processingError ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(mediaItems)
      .values({
        id: s.id,
        propertyId: s.propertyId,
        storageKey: s.storageKey ?? null,
        url: s.externalUrl ?? s.storageKey ?? '',
        contentType: s.contentType ?? null,
        sizeBytes: s.sizeBytes ?? null,
        uploadedBy: s.uploadedBy,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: mediaItems.id, set: values });
  }

  async delete(id: MediaItemId): Promise<void> {
    await this.db.delete(mediaItems).where(eq(mediaItems.id, id));
  }
}

export class DrizzlePropertyAttachmentRepository implements PropertyAttachmentRepository {
  constructor(private readonly db: DbExecutor) {}

  async findById(id: PropertyAttachmentId): Promise<PropertyAttachment | undefined> {
    const [row] = await this.db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
    if (!row) return undefined;
    if (row.propertyId === null) return undefined;
    return PropertyAttachment.restore({
      id: stored(parseId<'PropertyAttachment'>(row.id)),
      propertyId: stored(parseId<'Property'>(row.propertyId)),
      name: row.name,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      showOnWeb: row.showOnWeb,
      uploadedBy: row.uploadedBy,
      deletedAt: row.deletedAt ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  async save(attachment: PropertyAttachment, actorId: string): Promise<void> {
    const s = attachment.toSnapshot();
    const values = {
      name: s.name,
      showOnWeb: s.showOnWeb,
      deletedAt: s.deletedAt ?? null,
      updatedAt: s.updatedAt,
      updatedBy: actorId,
    };
    await this.db
      .insert(attachments)
      .values({
        id: s.id,
        propertyId: s.propertyId,
        storageKey: s.storageKey,
        mimeType: s.mimeType,
        sizeBytes: s.sizeBytes,
        uploadedBy: s.uploadedBy,
        createdAt: s.createdAt,
        createdBy: actorId,
        ...values,
      })
      .onConflictDoUpdate({ target: attachments.id, set: values });
  }
}
