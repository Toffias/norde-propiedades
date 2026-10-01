import {
  MEDIA_KINDS,
  MEDIA_PROCESSING_STATUSES,
  MEDIA_ROTATIONS,
  type PropertyAttachmentCriteria,
  type PropertyAttachmentRow,
  type PropertyMediaCriteria,
  type PropertyMediaQuery,
  type PropertyMediaRow,
} from '@norde/core/properties';
import type { PageSlice } from '@norde/core/shared';
import { and, asc, count, desc, eq, inArray, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';

import type { DbExecutor } from '../db/executor';
import { attachments, mediaItems } from '../db/schema';

const MediaEnums = z.object({
  kind: z.enum(MEDIA_KINDS),
  processingStatus: z.enum(MEDIA_PROCESSING_STATUSES),
  rotation: z.union(MEDIA_ROTATIONS.map((value) => z.literal(value))),
});

const IMAGE_KINDS = ['photo', 'floor_plan'];
const LINK_KINDS = ['video', 'tour_360'];

/** Galería y archivos de la ficha, paginados en la base con los índices por propiedad. */
export class DrizzlePropertyMediaQuery implements PropertyMediaQuery {
  constructor(private readonly db: DbExecutor) {}

  async listMedia(criteria: PropertyMediaCriteria): Promise<PageSlice<PropertyMediaRow>> {
    const where = and(
      eq(mediaItems.propertyId, criteria.propertyId),
      criteria.kind === undefined
        ? undefined
        : inArray(mediaItems.kind, criteria.kind === 'images' ? IMAGE_KINDS : LINK_KINDS),
    );
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: mediaItems.id,
          kind: mediaItems.kind,
          position: mediaItems.position,
          isCover: mediaItems.isCover,
          showOnWeb: mediaItems.showOnWeb,
          includeInPdf: mediaItems.includeInPdf,
          rotation: mediaItems.rotation,
          description: mediaItems.description,
          url: mediaItems.url,
          width: mediaItems.width,
          height: mediaItems.height,
          processingStatus: mediaItems.processingStatus,
          hasThumbnail: sql<boolean>`${mediaItems.variants} ? 'thumbnail'`,
          createdAt: mediaItems.createdAt,
        })
        .from(mediaItems)
        .where(where)
        .orderBy(asc(mediaItems.position), asc(mediaItems.id))
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db.select({ total: count() }).from(mediaItems).where(where),
    ]);
    return {
      items: rows.map((row) => {
        const enums = MediaEnums.parse(row);
        return {
          id: row.id,
          kind: enums.kind,
          position: row.position,
          isCover: row.isCover,
          showOnWeb: row.showOnWeb,
          includeInPdf: row.includeInPdf,
          rotation: enums.rotation,
          description: row.description ?? undefined,
          externalUrl: LINK_KINDS.includes(enums.kind) ? row.url : undefined,
          width: row.width ?? undefined,
          height: row.height ?? undefined,
          processing: enums.processingStatus,
          hasThumbnail: row.hasThumbnail,
          createdAt: row.createdAt,
        };
      }),
      total: totals[0]?.total ?? 0,
    };
  }

  async listAttachments(
    criteria: PropertyAttachmentCriteria,
  ): Promise<
    PageSlice<Omit<PropertyAttachmentRow, 'uploadedBy'> & { readonly uploadedBy: string }>
  > {
    const where = and(
      eq(attachments.propertyId, criteria.propertyId),
      isNull(attachments.deletedAt),
    );
    const direction = criteria.sort.direction === 'asc' ? asc : desc;
    const order: SQL[] =
      criteria.sort.field === 'name'
        ? [direction(attachments.name), direction(attachments.id)]
        : [direction(attachments.createdAt), direction(attachments.id)];
    const [rows, totals] = await Promise.all([
      this.db
        .select({
          id: attachments.id,
          name: attachments.name,
          mimeType: attachments.mimeType,
          sizeBytes: attachments.sizeBytes,
          showOnWeb: attachments.showOnWeb,
          uploadedBy: attachments.uploadedBy,
          createdAt: attachments.createdAt,
        })
        .from(attachments)
        .where(where)
        .orderBy(...order)
        .offset(criteria.offset)
        .limit(criteria.limit),
      this.db.select({ total: count() }).from(attachments).where(where),
    ]);
    return { items: rows, total: totals[0]?.total ?? 0 };
  }
}
