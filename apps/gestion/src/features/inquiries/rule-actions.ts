'use server';

import {
  CreateInquiryRuleInputSchema,
  InquiryRuleIdInputSchema,
  MoveInquiryRuleInputSchema,
  SetInquiryRuleActiveInputSchema,
  UpdateInquiryRuleInputSchema,
  type CreateInquiryRuleInput,
  type InquiryRuleIdInput,
  type InquiryRuleRow,
  type MoveInquiryRuleInput,
  type SetInquiryRuleActiveInput,
  type UpdateInquiryRuleInput,
} from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import {
  CREATE_INQUIRY_RULE_ERROR_MESSAGES,
  DELETE_INQUIRY_RULE_ERROR_MESSAGES,
  GET_INQUIRY_RULE_ERROR_MESSAGES,
  MOVE_INQUIRY_RULE_ERROR_MESSAGES,
  SET_INQUIRY_RULE_ACTIVE_ERROR_MESSAGES,
  UPDATE_INQUIRY_RULE_ERROR_MESSAGES,
} from './messages';

// Las reglas de asignación automática de consultas (#10, etapa 3).

const RULES_PATH = '/consultas/reglas';

type Failure = Extract<ActionResult, { readonly ok: false }>;

/** La regla entera, para editarla en el asistente. */
export async function loadInquiryRuleAction(
  input: InquiryRuleIdInput,
): Promise<{ readonly ok: true; readonly value: InquiryRuleRow } | Failure> {
  const { actor } = await requireSession();
  const parsed = InquiryRuleIdInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: GET_INQUIRY_RULE_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().inquiries.getInquiryRule.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, GET_INQUIRY_RULE_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}

export async function createInquiryRuleAction(
  input: CreateInquiryRuleInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateInquiryRuleInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_INQUIRY_RULE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().inquiries.createInquiryRule.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CREATE_INQUIRY_RULE_ERROR_MESSAGES));
  }
  revalidatePath(RULES_PATH);
  return ACTION_OK;
}

export async function updateInquiryRuleAction(
  input: UpdateInquiryRuleInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateInquiryRuleInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_INQUIRY_RULE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().inquiries.updateInquiryRule.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UPDATE_INQUIRY_RULE_ERROR_MESSAGES));
  }
  revalidatePath(RULES_PATH);
  return ACTION_OK;
}

export async function setInquiryRuleActiveAction(
  input: SetInquiryRuleActiveInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SetInquiryRuleActiveInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(SET_INQUIRY_RULE_ACTIVE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().inquiries.setInquiryRuleActive.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, SET_INQUIRY_RULE_ACTIVE_ERROR_MESSAGES));
  }
  revalidatePath(RULES_PATH);
  return ACTION_OK;
}

export async function moveInquiryRuleAction(input: MoveInquiryRuleInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = MoveInquiryRuleInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(MOVE_INQUIRY_RULE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().inquiries.moveInquiryRule.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, MOVE_INQUIRY_RULE_ERROR_MESSAGES));
  }
  revalidatePath(RULES_PATH);
  return ACTION_OK;
}

export async function deleteInquiryRuleAction(input: InquiryRuleIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = InquiryRuleIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DELETE_INQUIRY_RULE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().inquiries.deleteInquiryRule.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DELETE_INQUIRY_RULE_ERROR_MESSAGES));
  }
  revalidatePath(RULES_PATH);
  return ACTION_OK;
}
