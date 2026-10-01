// Contracts de multimedia y archivos de la ficha (#6).

import { z } from 'zod';

import { MAX_PAGE_SIZE, pageQuerySchema } from '../../shared/contracts';

export const MEDIA_KIND_VALUES = ['photo', 'floor_plan', 'video', 'tour_360'] as const;
export type MediaKindValue = (typeof MEDIA_KIND_VALUES)[number];

export const MEDIA_ROTATION_VALUES = [0, 90, 180, 270] as const;
export type MediaRotationValue = (typeof MEDIA_ROTATION_VALUES)[number];

export const MEDIA_PROCESSING_VALUES = ['pending', 'ready', 'failed'] as const;
export type MediaProcessingValue = (typeof MEDIA_PROCESSING_VALUES)[number];

export const MEDIA_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAX_MEDIA_UPLOAD_BYTES = 15 * 1024 * 1024;
export const MAX_ATTACHMENT_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Lo que ofrece el selector de archivos de la ficha (el caso de uso valida el tipo real). */
export const ATTACHMENT_UPLOAD_ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx';

const bytes = (max: number) =>
  z
    .instanceof(Uint8Array)
    .refine((value) => value.byteLength > 0, { message: 'El archivo está vacío.' })
    .refine((value) => value.byteLength <= max, { message: 'El archivo es demasiado grande.' });

const PropertyId = { propertyId: z.uuid() };

/** Una foto por pedido: la pantalla sube varias en paralelo y muestra el avance de cada una. */
export const UploadPropertyMediaInputSchema = z.object({
  ...PropertyId,
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(100),
  bytes: bytes(MAX_MEDIA_UPLOAD_BYTES),
});
export type UploadPropertyMediaInput = z.input<typeof UploadPropertyMediaInputSchema>;

export const AddPropertyMediaLinkInputSchema = z.object({
  ...PropertyId,
  kind: z.enum(['video', 'tour_360']),
  url: z.url({ protocol: /^https$/, message: 'Pegá el link completo, con https://.' }).max(500),
});
export type AddPropertyMediaLinkInput = z.input<typeof AddPropertyMediaLinkInputSchema>;

export const MediaIdInputSchema = z.object({ mediaId: z.uuid() });
export type MediaIdInput = z.input<typeof MediaIdInputSchema>;

export const UpdatePropertyMediaInputSchema = z
  .object({
    mediaId: z.uuid(),
    showOnWeb: z.boolean().optional(),
    includeInPdf: z.boolean().optional(),
    isFloorPlan: z.boolean().optional(),
    description: z.string().trim().max(300).optional(),
    rotation: z.literal(MEDIA_ROTATION_VALUES).optional(),
  })
  .refine(
    (input) =>
      input.showOnWeb !== undefined ||
      input.includeInPdf !== undefined ||
      input.isFloorPlan !== undefined ||
      input.description !== undefined ||
      input.rotation !== undefined,
    { message: 'Elegí qué cambiar de la foto.' },
  );
export type UpdatePropertyMediaInput = z.input<typeof UpdatePropertyMediaInputSchema>;

/** El orden completo de la galería, como queda después de arrastrar. */
export const ReorderPropertyMediaInputSchema = z.object({
  ...PropertyId,
  mediaIds: z.array(z.uuid()).min(1).max(100),
});
export type ReorderPropertyMediaInput = z.input<typeof ReorderPropertyMediaInputSchema>;

/** La galería de la ficha, paginada. */
export const ListPropertyMediaQuerySchema = pageQuerySchema({
  sortable: ['position'],
  defaultSort: { field: 'position', direction: 'asc' },
}).extend({
  ...PropertyId,
  /** La galería entra en una o dos páginas: una propiedad tiene como mucho 100 ítems. */
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  kind: z.enum(['images', 'links']).optional(),
});
export type ListPropertyMediaQuery = z.input<typeof ListPropertyMediaQuerySchema>;

export interface PropertyMediaRow {
  readonly id: string;
  readonly kind: MediaKindValue;
  readonly position: number;
  readonly isCover: boolean;
  readonly showOnWeb: boolean;
  readonly includeInPdf: boolean;
  readonly rotation: MediaRotationValue;
  readonly description: string | undefined;
  /** Videos y recorridos. */
  readonly externalUrl: string | undefined;
  readonly width: number | undefined;
  readonly height: number | undefined;
  readonly processing: MediaProcessingValue;
  readonly hasThumbnail: boolean;
  readonly createdAt: Date;
}

/** Qué versión de la foto se pide: la miniatura para la galería, la web o la original. */
export const MEDIA_VARIANT_VALUES = ['thumbnail', 'web', 'original'] as const;
export type MediaVariantValue = (typeof MEDIA_VARIANT_VALUES)[number];

export const GetPropertyMediaFileInputSchema = z.object({
  mediaId: z.uuid(),
  variant: z.enum(MEDIA_VARIANT_VALUES).default('thumbnail'),
});
export type GetPropertyMediaFileInput = z.input<typeof GetPropertyMediaFileInputSchema>;

// ---------- Jobs ----------

/** Solo claves de la galería de una propiedad: el job nunca borra otra cosa del storage. */
export const DeleteStoredMediaFilesInputSchema = z.object({
  storageKeys: z
    .array(z.string().regex(/^properties\/[0-9a-f-]{36}\/media\/[0-9a-f-]{36}\/[a-z0-9-]+$/))
    .max(10),
});
export type DeleteStoredMediaFilesInput = z.input<typeof DeleteStoredMediaFilesInputSchema>;

// ---------- Archivos ----------

export const UploadPropertyAttachmentInputSchema = z.object({
  ...PropertyId,
  fileName: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(1).max(200),
  bytes: bytes(MAX_ATTACHMENT_UPLOAD_BYTES),
});
export type UploadPropertyAttachmentInput = z.input<typeof UploadPropertyAttachmentInputSchema>;

export const AttachmentIdInputSchema = z.object({ attachmentId: z.uuid() });
export type AttachmentIdInput = z.input<typeof AttachmentIdInputSchema>;

export const UpdatePropertyAttachmentInputSchema = z
  .object({
    attachmentId: z.uuid(),
    name: z.string().trim().min(1).max(150).optional(),
    showOnWeb: z.boolean().optional(),
  })
  .refine((input) => input.name !== undefined || input.showOnWeb !== undefined, {
    message: 'Elegí qué cambiar del archivo.',
  });
export type UpdatePropertyAttachmentInput = z.input<typeof UpdatePropertyAttachmentInputSchema>;

export const PROPERTY_ATTACHMENT_SORT_FIELDS = ['createdAt', 'name'] as const;

export const ListPropertyAttachmentsQuerySchema = pageQuerySchema({
  sortable: PROPERTY_ATTACHMENT_SORT_FIELDS,
  defaultSort: { field: 'createdAt', direction: 'desc' },
}).extend(PropertyId);
export type ListPropertyAttachmentsQuery = z.input<typeof ListPropertyAttachmentsQuerySchema>;

export interface PropertyAttachmentRow {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly showOnWeb: boolean;
  readonly uploadedBy: { readonly id: string; readonly name: string | undefined };
  readonly createdAt: Date;
}

/**
 * Cómo se entrega un archivo: una URL firmada de corta duración (S3/R2) o el contenido, cuando el
 * storage no firma URLs (disco local).
 */
export type StoredFileDelivery =
  | { readonly kind: 'redirect'; readonly url: string }
  | {
      readonly kind: 'content';
      readonly fileName: string;
      readonly contentType: string;
      readonly bytes: Uint8Array;
    };
