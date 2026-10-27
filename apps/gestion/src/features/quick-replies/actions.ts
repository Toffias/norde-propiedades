'use server';

import {
  CreateQuickReplyInputSchema,
  QuickReplyIdInputSchema,
  SetQuickReplyActiveInputSchema,
  UpdateQuickReplyInputSchema,
  type CreateQuickReplyInput,
  type QuickReplyIdInput,
  type QuickReplyRow,
  type SetQuickReplyActiveInput,
  type UpdateQuickReplyInput,
} from '@norde/core/clients/contracts';
import type { ComboboxPage } from '@norde/ui/components/paged-combobox';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import {
  CREATE_QUICK_REPLY_ERROR_MESSAGES,
  DELETE_QUICK_REPLY_ERROR_MESSAGES,
  GET_QUICK_REPLY_ERROR_MESSAGES,
  SET_QUICK_REPLY_ACTIVE_ERROR_MESSAGES,
  UPDATE_QUICK_REPLY_ERROR_MESSAGES,
} from './messages';

// Respuestas rápidas: plantillas de mensaje para los envíos (#105).

const QUICK_REPLIES_PATH = '/mi-empresa/respuestas-rapidas';
const PICKER_PAGE_SIZE = 20;

type Failure = Extract<ActionResult, { readonly ok: false }>;

export async function createQuickReplyAction(input: CreateQuickReplyInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateQuickReplyInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_QUICK_REPLY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.createQuickReply.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CREATE_QUICK_REPLY_ERROR_MESSAGES));
  }
  revalidatePath(QUICK_REPLIES_PATH);
  return ACTION_OK;
}

export async function updateQuickReplyAction(input: UpdateQuickReplyInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateQuickReplyInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_QUICK_REPLY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.updateQuickReply.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UPDATE_QUICK_REPLY_ERROR_MESSAGES));
  }
  revalidatePath(QUICK_REPLIES_PATH);
  return ACTION_OK;
}

export async function setQuickReplyActiveAction(
  input: SetQuickReplyActiveInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SetQuickReplyActiveInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(SET_QUICK_REPLY_ACTIVE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.setQuickReplyActive.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, SET_QUICK_REPLY_ACTIVE_ERROR_MESSAGES));
  }
  revalidatePath(QUICK_REPLIES_PATH);
  return ACTION_OK;
}

export async function deleteQuickReplyAction(input: QuickReplyIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = QuickReplyIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DELETE_QUICK_REPLY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.deleteQuickReply.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DELETE_QUICK_REPLY_ERROR_MESSAGES));
  }
  revalidatePath(QUICK_REPLIES_PATH);
  return ACTION_OK;
}

/** Las respuestas rápidas activas para elegir una al enviar, de a una página, por nombre. */
export async function loadQuickReplyOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().clients.listQuickReplies.execute(
    { page, pageSize: PICKER_PAGE_SIZE, ...(search.trim() === '' ? {} : { q: search }) },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the quick replies: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map((reply) => ({
      value: reply.id,
      label: reply.name,
      ...(reply.subject === undefined ? {} : { hint: reply.subject }),
    })),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}

/** Una respuesta rápida entera, para volcarla en el mensaje de un envío. */
export async function loadQuickReplyAction(
  input: QuickReplyIdInput,
): Promise<{ readonly ok: true; readonly value: QuickReplyRow } | Failure> {
  const { actor } = await requireSession();
  const parsed = QuickReplyIdInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: GET_QUICK_REPLY_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().clients.getQuickReply.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, GET_QUICK_REPLY_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}
