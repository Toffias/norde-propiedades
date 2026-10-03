'use server';

import {
  AddMediaLinkInputSchema,
  AttachmentIdInputSchema,
  MediaIdInputSchema,
  MediaOwnerInputSchema,
  ReorderMediaInputSchema,
  UpdateAttachmentInputSchema,
  UpdateMediaInputSchema,
  UploadAttachmentInputSchema,
  UploadMediaInputSchema,
  type AddMediaLinkInput,
  type AttachmentIdInput,
  type MediaIdInput,
  type MediaOwnerInput,
  type ReorderMediaInput,
  type UpdateAttachmentInput,
  type UpdateMediaInput,
} from '@norde/core/properties/contracts';
import type { Result } from '@norde/core/shared';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { MEDIA_ERROR_MESSAGES, type MediaError } from './messages';

// Server Actions de la galería y los archivos de una ficha: una por caso de uso. El dueño
// (propiedad o emprendimiento) decide qué pantallas se revalidan.

const INVALID = MEDIA_ERROR_MESSAGES.InvalidInput;

function properties() {
  return getContainer().properties;
}

/** La ficha del dueño y su listado (la portada se ve en la grilla). */
function revalidateOwner(owner: MediaOwnerInput): void {
  const list = owner.kind === 'property' ? '/propiedades' : '/emprendimientos';
  revalidatePath(`${list}/${owner.id}`);
  revalidatePath(list);
}

function done(result: Result<unknown, MediaError>, owner: MediaOwnerInput): ActionResult {
  if (result.isErr()) return actionFailed(messageForError(result.error, MEDIA_ERROR_MESSAGES));
  revalidateOwner(owner);
  return ACTION_OK;
}

/** El dueño y el archivo de un `FormData`, tal como los esperan los contracts de subida. */
async function uploadFrom(form: FormData) {
  const file = form.get('file');
  return {
    owner: { kind: form.get('ownerKind'), id: form.get('ownerId') },
    ...(file instanceof File
      ? {
          fileName: file.name,
          contentType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        }
      : {}),
  };
}

/** Una foto por pedido: la pantalla sube varias en paralelo y muestra el avance de cada una. */
export async function uploadMediaAction(form: FormData): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UploadMediaInputSchema.safeParse(await uploadFrom(form));
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().uploadMedia.execute(parsed.data, actor);
  return done(result, parsed.data.owner);
}

export async function addMediaLinkAction(input: AddMediaLinkInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = AddMediaLinkInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(MEDIA_ERROR_MESSAGES.InvalidMediaUrl);
  const result = await properties().addMediaLink.execute(parsed.data, actor);
  return done(result, parsed.data.owner);
}

export async function reorderMediaAction(input: ReorderMediaInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ReorderMediaInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().reorderMedia.execute(parsed.data, actor);
  return done(result, parsed.data.owner);
}

/** Las acciones sobre una foto o un archivo revalidan la ficha desde la que se pidieron. */
export async function updateMediaAction(
  owner: MediaOwnerInput,
  input: UpdateMediaInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const from = MediaOwnerInputSchema.safeParse(owner);
  const parsed = UpdateMediaInputSchema.safeParse(input);
  if (!from.success || !parsed.success) return actionFailed(INVALID);
  const result = await properties().updateMedia.execute(parsed.data, actor);
  return done(result, from.data);
}

export async function setMediaCoverAction(
  owner: MediaOwnerInput,
  input: MediaIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const from = MediaOwnerInputSchema.safeParse(owner);
  const parsed = MediaIdInputSchema.safeParse(input);
  if (!from.success || !parsed.success) return actionFailed(INVALID);
  const result = await properties().setMediaCover.execute(parsed.data, actor);
  return done(result, from.data);
}

export async function deleteMediaAction(
  owner: MediaOwnerInput,
  input: MediaIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const from = MediaOwnerInputSchema.safeParse(owner);
  const parsed = MediaIdInputSchema.safeParse(input);
  if (!from.success || !parsed.success) return actionFailed(INVALID);
  const result = await properties().deleteMedia.execute(parsed.data, actor);
  return done(result, from.data);
}

export async function uploadAttachmentAction(form: FormData): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UploadAttachmentInputSchema.safeParse(await uploadFrom(form));
  if (!parsed.success) return actionFailed(INVALID);
  const result = await properties().uploadAttachment.execute(parsed.data, actor);
  return done(result, parsed.data.owner);
}

export async function updateAttachmentAction(
  owner: MediaOwnerInput,
  input: UpdateAttachmentInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const from = MediaOwnerInputSchema.safeParse(owner);
  const parsed = UpdateAttachmentInputSchema.safeParse(input);
  if (!from.success || !parsed.success) return actionFailed(INVALID);
  const result = await properties().updateAttachment.execute(parsed.data, actor);
  return done(result, from.data);
}

export async function deleteAttachmentAction(
  owner: MediaOwnerInput,
  input: AttachmentIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const from = MediaOwnerInputSchema.safeParse(owner);
  const parsed = AttachmentIdInputSchema.safeParse(input);
  if (!from.success || !parsed.success) return actionFailed(INVALID);
  const result = await properties().deleteAttachment.execute(parsed.data, actor);
  return done(result, from.data);
}
