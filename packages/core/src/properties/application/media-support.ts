import {
  err,
  ok,
  type Actor,
  type AuditState,
  type AuditTarget,
  type ForbiddenError,
  type Result,
} from '../../shared';
import type { MediaOwnerInput } from '../contracts';
import type { Attachment } from '../domain/attachment';
import type { DevelopmentInTrashError } from '../domain/development';
import type { MediaItem } from '../domain/media-item';
import type { MediaOwner, MediaOwnerKind } from '../domain/media-owner';
import type { PropertyInTrashError } from '../domain/property';
import { idOf } from './catalog-support';
import {
  canEditDevelopments,
  loadDevelopmentForEdit,
  type DevelopmentNotFoundError,
} from './development-support';
import type { PropertiesTransaction } from './ports/properties-transaction';
import {
  canEditProperties,
  loadForEdit,
  propertyTarget,
  type InvalidInputError,
  type PropertyNotFoundError,
} from './property-support';

// Lo que comparten los commands de multimedia y archivos, que son de una propiedad o de un
// emprendimiento (su dueño). Los cambios se auditan contra el dueño, para que aparezcan en su
// historial, con el campo prefijado por la fila hija.

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

/** El dueño no existe o el actor no lo puede editar. */
export type MediaOwnerError = ForbiddenError | PropertyNotFoundError | DevelopmentNotFoundError;
export type MediaOwnerInTrashError = PropertyInTrashError | DevelopmentInTrashError;
/** El ID del dueño pedido no es válido. */
export type MediaOwnerReadError = PropertyNotFoundError | DevelopmentNotFoundError;
/** Lo que puede fallar en cualquier command que cambia una galería activa. */
export type EditMediaError = InvalidInputError | MediaOwnerError | MediaOwnerInTrashError;

/** Las acciones del historial; se registran como `property.<acción>` o `development.<acción>`. */
export type MediaAuditAction =
  | 'media_added'
  | 'media_updated'
  | 'media_reordered'
  | 'cover_changed'
  | 'media_deleted'
  | 'attachment_added'
  | 'attachment_updated'
  | 'attachment_deleted';

const STORAGE_FOLDER: Readonly<Record<MediaOwnerKind, string>> = {
  property: 'properties',
  development: 'developments',
};

/**
 * Ruta en el storage: por dueño y por ítem, nunca con el nombre del archivo. Sin extensión: el
 * tipo de contenido se guarda con el objeto.
 */
export function mediaKey(owner: MediaOwner, mediaId: string, name: string): string {
  return `${STORAGE_FOLDER[owner.kind]}/${owner.id}/media/${mediaId}/${name}`;
}

export function attachmentKey(owner: MediaOwner, attachmentId: string): string {
  return `${STORAGE_FOLDER[owner.kind]}/${owner.id}/attachments/${attachmentId}`;
}

/** Puede editar al menos sus propiedades o sus emprendimientos: se chequea antes del input. */
export function canEditMedia(actor: Actor): boolean {
  return canEditProperties(actor) || canEditDevelopments(actor);
}

/** Ver la galería y los archivos sigue el permiso de lectura del dueño. */
export function canReadMedia(actor: Actor, kind: MediaOwnerKind): boolean {
  return actor.can(kind === 'property' ? 'properties:read' : 'developments:read');
}

/** Puede ver la galería de al menos uno de los dos: se chequea antes del input. */
export function canReadAnyMedia(actor: Actor): boolean {
  return canReadMedia(actor, 'property') || canReadMedia(actor, 'development');
}

function notFound(kind: MediaOwnerKind): PropertyNotFoundError | DevelopmentNotFoundError {
  return kind === 'property' ? { type: 'PropertyNotFound' } : { type: 'DevelopmentNotFound' };
}

export function ownerInTrash(owner: MediaOwner): MediaOwnerInTrashError {
  return owner.kind === 'property' ? { type: 'PropertyInTrash' } : { type: 'DevelopmentInTrash' };
}

/** El dueño del input validado, con su ID tipado. */
export function toMediaOwner(input: MediaOwnerInput): Result<MediaOwner, MediaOwnerReadError> {
  if (input.kind === 'property') {
    const id = idOf<'Property'>(input.id);
    return id === undefined ? err(notFound('property')) : ok({ kind: 'property', id });
  }
  const id = idOf<'Development'>(input.id);
  return id === undefined ? err(notFound('development')) : ok({ kind: 'development', id });
}

export function ownerTarget(action: MediaAuditAction, owner: MediaOwner): AuditTarget {
  if (owner.kind === 'property') return propertyTarget(`property.${action}`, owner.id);
  return {
    action: `development.${action}`,
    entityType: 'development',
    entityId: owner.id,
    clientIds: [],
  };
}

/** El dueño, si existe y el actor puede editarlo, y si está en la papelera. */
export async function loadOwnerForEdit(
  tx: PropertiesTransaction,
  actor: Actor,
  owner: MediaOwner,
): Promise<Result<{ readonly inTrash: boolean }, MediaOwnerError>> {
  const loaded =
    owner.kind === 'property'
      ? await loadForEdit(tx, actor, owner.id)
      : await loadDevelopmentForEdit(tx, actor, owner.id);
  if (loaded.isErr()) return err(loaded.error);
  return ok({ inTrash: loaded.value.isDeleted });
}

/** El dueño del input, si existe, el actor puede editarlo y no está en la papelera. */
export async function loadActiveOwner(
  tx: PropertiesTransaction,
  actor: Actor,
  input: MediaOwnerInput,
): Promise<Result<MediaOwner, MediaOwnerError | MediaOwnerInTrashError>> {
  const owner = toMediaOwner(input);
  if (owner.isErr()) return err(owner.error);
  const loaded = await loadOwnerForEdit(tx, actor, owner.value);
  if (loaded.isErr()) return err(loaded.error);
  return loaded.value.inTrash ? err(ownerInTrash(owner.value)) : ok(owner.value);
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

export function attachmentAuditState(attachment: Attachment): AuditState {
  const s = attachment.toSnapshot();
  return { name: s.name, mimeType: s.mimeType, sizeBytes: s.sizeBytes, showOnWeb: s.showOnWeb };
}

/** Prefija cada campo con la fila hija (`media.<id>.showOnWeb`). */
export function childState(prefix: string, state: AuditState): AuditState {
  return Object.fromEntries(
    Object.entries(state).map(([field, value]) => [`${prefix}.${field}`, value]),
  );
}

/** Un ítem de la galería, si el actor puede editar su dueño y el dueño no está en la papelera. */
export async function loadMediaForEdit(
  tx: PropertiesTransaction,
  actor: Actor,
  mediaId: string,
): Promise<Result<MediaItem, MediaNotFoundError | MediaOwnerError | MediaOwnerInTrashError>> {
  const id = idOf<'MediaItem'>(mediaId);
  const item = id === undefined ? undefined : await tx.media.findById(id);
  if (!item) return err({ type: 'MediaNotFound' });
  const owner = await loadOwnerForEdit(tx, actor, item.owner);
  if (owner.isErr()) return err(owner.error);
  return owner.value.inTrash ? err(ownerInTrash(item.owner)) : ok(item);
}

/** Un archivo sin borrar, si el actor puede editar su dueño. */
export async function loadAttachmentForEdit(
  tx: PropertiesTransaction,
  actor: Actor,
  attachmentId: string,
): Promise<Result<Attachment, AttachmentNotFoundError | MediaOwnerError>> {
  const id = idOf<'Attachment'>(attachmentId);
  const attachment = id === undefined ? undefined : await tx.attachments.findById(id);
  if (!attachment || attachment.isDeleted) return err({ type: 'AttachmentNotFound' });
  const owner = await loadOwnerForEdit(tx, actor, attachment.owner);
  if (owner.isErr()) return err(owner.error);
  return ok(attachment);
}
