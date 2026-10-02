'use server';

import {
  AssignInquiryInputSchema,
  InquiryIdInputSchema,
  ListInquiryMatchesQuerySchema,
  type AssignInquiryInput,
  type AssignInquiryOutput,
  type InquiryClientMatch,
  type InquiryIdInput,
  type ListInquiryMatchesQuery,
} from '@norde/core/clients/contracts';
import type { Page } from '@norde/core/shared';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  ASSIGN_INQUIRY_ERROR_MESSAGES,
  DELETE_INQUIRY_ERROR_MESSAGES,
  INQUIRY_MATCHES_ERROR_MESSAGES,
  RESTORE_INQUIRY_ERROR_MESSAGES,
} from './messages';

type Failure = Extract<ActionResult, { readonly ok: false }>;

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

/** Una página de los contactos que comparten el teléfono o el email de la consulta. */
export async function loadInquiryMatchesAction(
  input: ListInquiryMatchesQuery,
): Promise<{ readonly ok: true; readonly value: Page<InquiryClientMatch> } | Failure> {
  const { actor } = await requireSession();
  const parsed = ListInquiryMatchesQuerySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: INQUIRY_MATCHES_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().inquiries.listInquiryMatches.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, INQUIRY_MATCHES_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}

/** Asigna la consulta: también cambian el contacto, su oportunidad y el contador del pipeline. */
export async function assignInquiryAction(
  input: AssignInquiryInput,
): Promise<{ readonly ok: true; readonly value: AssignInquiryOutput } | Failure> {
  const { actor } = await requireSession();
  const parsed = AssignInquiryInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: ASSIGN_INQUIRY_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().inquiries.assignInquiry.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, ASSIGN_INQUIRY_ERROR_MESSAGES) };
  }
  revalidatePath('/', 'layout');
  return { ok: true, value: result.value };
}
