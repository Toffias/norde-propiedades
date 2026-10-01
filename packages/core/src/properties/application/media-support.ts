import {
  err,
  ok,
  type Actor,
  type AuditState,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { MediaItem } from '../domain/media-item';
import type { Property } from '../domain/property';
import type { PropertyAttachment } from '../domain/property-attachment';
import { idOf } from './catalog-support';
import type { PropertiesTransaction } from './ports/properties-transaction';
import { loadForEdit, type PropertyNotFoundError } from './property-support';

// Lo que comparten los commands de multimedia y archivos. Los cambios se auditan contra la
// propiedad, para que aparezcan en su historial, con el campo prefijado por la fila hija.

export interface MediaNotFoundError {
  readonly type: 'MediaNotFound';
}
export interface AttachmentNotFoundError {
  readonly type: 'AttachmentNotFound';
}
export interface TooManyMediaError {
  readonly type: 'TooManyMedia';
  readonly max: number;
}

/**
 * Ruta en el storage: por propiedad y por ítem, nunca con el nombre del archivo. Sin extensión: el
 * tipo de contenido se guarda con el objeto.
 */
export function mediaKey(propertyId: string, mediaId: string, name: string): string {
  return `properties/${propertyId}/media/${mediaId}/${name}`;
}

export function attachmentKey(propertyId: string, attachmentId: string): string {
  return `properties/${propertyId}/attachments/${attachmentId}`;
}

export function mediaAuditState(item: MediaItem): AuditState {
  const s = item.toSnapshot();
  return {
    kind: s.kind,
    position: s.position,
    isCover: s.isCover,
    showOnWeb: s.showOnWeb,
    includeInPdf: s.includeInPdf,
    rotation: s.rotation,
    description: s.description,
    externalUrl: s.externalUrl,
  };
}

export function attachmentAuditState(attachment: PropertyAttachment): AuditState {
  const s = attachment.toSnapshot();
  return { name: s.name, mimeType: s.mimeType, sizeBytes: s.sizeBytes, showOnWeb: s.showOnWeb };
}

/** Prefija cada campo con la fila hija (`media.<id>.showOnWeb`). */
export function childState(prefix: string, state: AuditState): AuditState {
  return Object.fromEntries(
    Object.entries(state).map(([field, value]) => [`${prefix}.${field}`, value]),
  );
}

/** Un ítem de la galería y su propiedad, si el actor puede editarla. */
export async function loadMediaForEdit(
  tx: PropertiesTransaction,
  actor: Actor,
  mediaId: string,
): Promise<
  Result<
    { readonly item: MediaItem; readonly property: Property },
    MediaNotFoundError | ForbiddenError | PropertyNotFoundError
  >
> {
  const id = idOf<'MediaItem'>(mediaId);
  const item = id === undefined ? undefined : await tx.media.findById(id);
  if (!item) return err({ type: 'MediaNotFound' });
  const property = await loadForEdit(tx, actor, item.propertyId);
  if (property.isErr()) return err(property.error);
  return ok({ item, property: property.value });
}

export async function loadAttachmentForEdit(
  tx: PropertiesTransaction,
  actor: Actor,
  attachmentId: string,
): Promise<
  Result<PropertyAttachment, AttachmentNotFoundError | ForbiddenError | PropertyNotFoundError>
> {
  const id = idOf<'PropertyAttachment'>(attachmentId);
  const attachment = id === undefined ? undefined : await tx.attachments.findById(id);
  if (!attachment || attachment.isDeleted) return err({ type: 'AttachmentNotFound' });
  const property = await loadForEdit(tx, actor, attachment.propertyId);
  if (property.isErr()) return err(property.error);
  return ok(attachment);
}
