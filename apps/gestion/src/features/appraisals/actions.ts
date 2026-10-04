'use server';

import {
  AppraisalIdInputSchema,
  AppraisalPhotoInputSchema,
  ChangeAppraisalStatusInputSchema,
  CreateAppraisalInputSchema,
  RecordAppraisalResultInputSchema,
  UpdateAppraisalInputSchema,
  UploadAppraisalPhotoInputSchema,
  type AppraisalIdInput,
  type AppraisalPhotoInput,
  type ChangeAppraisalStatusInput,
  type CreateAppraisalInput,
  type RecordAppraisalResultInput,
  type UpdateAppraisalInput,
} from '@norde/core/appraisals/contracts';
import type {
  ChangeAppraisalStatusError,
  DeleteAppraisalError,
  DeleteAppraisalPhotoError,
  RecordAppraisalResultError,
  RestoreAppraisalError,
  UpdateAppraisalError,
  UploadAppraisalPhotoError,
} from '@norde/core/appraisals';
import type { Result } from '@norde/core/shared';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { APPRAISAL_ERROR_MESSAGES } from './messages';

// Server Actions de las tasaciones (#12): una por caso de uso.

const APPRAISALS_PATH = '/tasaciones';
const INVALID = APPRAISAL_ERROR_MESSAGES.InvalidInput;

function appraisals() {
  return getContainer().appraisals;
}

type AppraisalCommandError =
  | UpdateAppraisalError
  | ChangeAppraisalStatusError
  | DeleteAppraisalError
  | RestoreAppraisalError
  | RecordAppraisalResultError
  | UploadAppraisalPhotoError
  | DeleteAppraisalPhotoError;

/** Mapea el resultado y revalida el listado y las fichas. */
function done(result: Result<unknown, AppraisalCommandError>): ActionResult {
  if (result.isErr()) return actionFailed(messageForError(result.error, APPRAISAL_ERROR_MESSAGES));
  revalidatePath(APPRAISALS_PATH, 'layout');
  return ACTION_OK;
}

export async function createAppraisalAction(
  input: CreateAppraisalInput,
): Promise<ActionResult & { readonly appraisalId?: string; readonly code?: string }> {
  const { actor } = await requireSession();
  const parsed = CreateAppraisalInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await appraisals().createAppraisal.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, APPRAISAL_ERROR_MESSAGES));
  revalidatePath(APPRAISALS_PATH, 'layout');
  return { ok: true, ...result.value };
}

export async function updateAppraisalAction(input: UpdateAppraisalInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateAppraisalInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  return done(await appraisals().updateAppraisal.execute(parsed.data, actor));
}

export async function changeAppraisalStatusAction(
  input: ChangeAppraisalStatusInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangeAppraisalStatusInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  return done(await appraisals().changeAppraisalStatus.execute(parsed.data, actor));
}

export async function deleteAppraisalAction(input: AppraisalIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = AppraisalIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  return done(await appraisals().deleteAppraisal.execute(parsed.data, actor));
}

export async function restoreAppraisalAction(input: AppraisalIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = AppraisalIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  return done(await appraisals().restoreAppraisal.execute(parsed.data, actor));
}

export async function recordAppraisalResultAction(
  input: RecordAppraisalResultInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RecordAppraisalResultInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  return done(await appraisals().recordAppraisalResult.execute(parsed.data, actor));
}

/** Una foto por pedido: la pantalla sube varias en paralelo y muestra el avance. */
export async function uploadAppraisalPhotoAction(form: FormData): Promise<ActionResult> {
  const { actor } = await requireSession();
  const file = form.get('file');
  const parsed = UploadAppraisalPhotoInputSchema.safeParse({
    appraisalId: form.get('appraisalId'),
    ...(file instanceof File
      ? { contentType: file.type, bytes: new Uint8Array(await file.arrayBuffer()) }
      : {}),
  });
  if (!parsed.success) return actionFailed(INVALID);
  return done(await appraisals().uploadAppraisalPhoto.execute(parsed.data, actor));
}

export async function deleteAppraisalPhotoAction(
  input: AppraisalPhotoInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = AppraisalPhotoInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  return done(await appraisals().deleteAppraisalPhoto.execute(parsed.data, actor));
}

/** Convierte la tasación en propiedad; la propiedad la crea un job en unos segundos. */
export async function convertAppraisalToListingAction(
  input: AppraisalIdInput,
): Promise<ActionResult & { readonly propertyId?: string }> {
  const { actor } = await requireSession();
  const parsed = AppraisalIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await appraisals().convertAppraisalToListing.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, APPRAISAL_ERROR_MESSAGES));
  revalidatePath(APPRAISALS_PATH, 'layout');
  return { ok: true, ...result.value };
}
