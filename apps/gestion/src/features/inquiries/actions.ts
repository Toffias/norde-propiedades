'use server';

import { InquiryIdInputSchema, type InquiryIdInput } from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { DELETE_INQUIRY_ERROR_MESSAGES, RESTORE_INQUIRY_ERROR_MESSAGES } from './messages';

const INQUIRIES_PATH = '/consultas';

/** La bandeja y su layout: el contador del menú cambia con las pendientes. */
function revalidateInbox(): void {
  revalidatePath(INQUIRIES_PATH, 'layout');
}

export async function deleteInquiryAction(input: InquiryIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = InquiryIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DELETE_INQUIRY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().inquiries.deleteInquiry.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DELETE_INQUIRY_ERROR_MESSAGES));
  }
  revalidateInbox();
  return ACTION_OK;
}

export async function restoreInquiryAction(input: InquiryIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = InquiryIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(RESTORE_INQUIRY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().inquiries.restoreInquiry.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, RESTORE_INQUIRY_ERROR_MESSAGES));
  }
  revalidateInbox();
  return ACTION_OK;
}
