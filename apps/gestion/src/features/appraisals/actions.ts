'use server';

import {
  AppraisalIdInputSchema,
  ChangeAppraisalStatusInputSchema,
  CreateAppraisalInputSchema,
  UpdateAppraisalInputSchema,
  type AppraisalIdInput,
  type ChangeAppraisalStatusInput,
  type CreateAppraisalInput,
  type UpdateAppraisalInput,
} from '@norde/core/appraisals/contracts';
import type {
  ChangeAppraisalStatusError,
  DeleteAppraisalError,
  RestoreAppraisalError,
  UpdateAppraisalError,
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
  UpdateAppraisalError | ChangeAppraisalStatusError | DeleteAppraisalError | RestoreAppraisalError;

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
