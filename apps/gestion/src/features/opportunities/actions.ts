'use server';

import {
  CloseReasonIdInputSchema,
  CreateCloseReasonInputSchema,
  CreateOpportunityStageInputSchema,
  OpportunityStageIdInputSchema,
  ReorderCloseReasonsInputSchema,
  ReorderOpportunityStagesInputSchema,
  UpdateCloseReasonInputSchema,
  UpdateOpportunitySettingsInputSchema,
  UpdateOpportunityStageInputSchema,
  type CloseReasonIdInput,
  type CreateCloseReasonInput,
  type CreateOpportunityStageInput,
  type OpportunityStageIdInput,
  type ReorderCloseReasonsInput,
  type ReorderOpportunityStagesInput,
  type UpdateCloseReasonInput,
  type UpdateOpportunitySettingsInput,
  type UpdateOpportunityStageInput,
} from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import {
  CREATE_REASON_ERROR_MESSAGES,
  CREATE_STAGE_ERROR_MESSAGES,
  DEACTIVATE_REASON_ERROR_MESSAGES,
  DEACTIVATE_STAGE_ERROR_MESSAGES,
  REACTIVATE_REASON_ERROR_MESSAGES,
  REACTIVATE_STAGE_ERROR_MESSAGES,
  REORDER_REASONS_ERROR_MESSAGES,
  REORDER_STAGES_ERROR_MESSAGES,
  UPDATE_REASON_ERROR_MESSAGES,
  UPDATE_RULES_ERROR_MESSAGES,
  UPDATE_STAGE_ERROR_MESSAGES,
} from './messages';

const SETTINGS_PATH = '/mi-empresa/oportunidades';

export async function createOpportunityStageAction(
  input: CreateOpportunityStageInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateOpportunityStageInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_STAGE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.createOpportunityStage.execute(parsed.data, actor);
  if (result.isErr())
    return actionFailed(messageForError(result.error, CREATE_STAGE_ERROR_MESSAGES));
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function updateOpportunityStageAction(
  input: UpdateOpportunityStageInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateOpportunityStageInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_STAGE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.updateOpportunityStage.execute(parsed.data, actor);
  if (result.isErr())
    return actionFailed(messageForError(result.error, UPDATE_STAGE_ERROR_MESSAGES));
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function reorderOpportunityStagesAction(
  input: ReorderOpportunityStagesInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ReorderOpportunityStagesInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(REORDER_STAGES_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.reorderOpportunityStages.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REORDER_STAGES_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function deactivateOpportunityStageAction(
  input: OpportunityStageIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = OpportunityStageIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DEACTIVATE_STAGE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.deactivateOpportunityStage.execute(
    parsed.data,
    actor,
  );
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DEACTIVATE_STAGE_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function reactivateOpportunityStageAction(
  input: OpportunityStageIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = OpportunityStageIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(REACTIVATE_STAGE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.reactivateOpportunityStage.execute(
    parsed.data,
    actor,
  );
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REACTIVATE_STAGE_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function createCloseReasonAction(
  input: CreateCloseReasonInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateCloseReasonInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_REASON_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.createCloseReason.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CREATE_REASON_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function updateCloseReasonAction(
  input: UpdateCloseReasonInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateCloseReasonInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_REASON_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.updateCloseReason.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UPDATE_REASON_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function reorderCloseReasonsAction(
  input: ReorderCloseReasonsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ReorderCloseReasonsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(REORDER_REASONS_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.reorderCloseReasons.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REORDER_REASONS_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function deactivateCloseReasonAction(
  input: CloseReasonIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CloseReasonIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DEACTIVATE_REASON_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.deactivateCloseReason.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DEACTIVATE_REASON_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function reactivateCloseReasonAction(
  input: CloseReasonIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CloseReasonIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(REACTIVATE_REASON_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.reactivateCloseReason.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REACTIVATE_REASON_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}

export async function updateOpportunitySettingsAction(
  input: UpdateOpportunitySettingsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateOpportunitySettingsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_RULES_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.updateOpportunitySettings.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UPDATE_RULES_ERROR_MESSAGES));
  }
  revalidatePath(SETTINGS_PATH);
  return ACTION_OK;
}
