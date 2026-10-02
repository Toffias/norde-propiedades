'use server';

import {
  ChangeOpportunityStageInputSchema,
  CloseOpportunityInputSchema,
  ReassignOpportunityInputSchema,
  type ChangeOpportunityStageInput,
  type CloseOpportunityInput,
  type ReassignOpportunityInput,
} from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import {
  CHANGE_STAGE_ERROR_MESSAGES,
  CLOSE_OPPORTUNITY_ERROR_MESSAGES,
  REASSIGN_OPPORTUNITY_ERROR_MESSAGES,
} from './messages';

// Acciones sobre una oportunidad: desde el pipeline y desde la ficha del contacto. Revalidan el
// layout entero porque el contador del menú (nuevas asignadas) puede cambiar.

function revalidatePanel() {
  revalidatePath('/', 'layout');
}

export async function changeOpportunityStageAction(
  input: ChangeOpportunityStageInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangeOpportunityStageInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CHANGE_STAGE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.changeOpportunityStage.execute(parsed.data, actor);
  if (result.isErr())
    return actionFailed(messageForError(result.error, CHANGE_STAGE_ERROR_MESSAGES));
  revalidatePanel();
  return ACTION_OK;
}

export async function closeOpportunityAction(input: CloseOpportunityInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CloseOpportunityInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CLOSE_OPPORTUNITY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.closeOpportunity.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CLOSE_OPPORTUNITY_ERROR_MESSAGES));
  }
  revalidatePanel();
  return ACTION_OK;
}

export async function reassignOpportunityAction(
  input: ReassignOpportunityInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ReassignOpportunityInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(REASSIGN_OPPORTUNITY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.reassignOpportunity.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REASSIGN_OPPORTUNITY_ERROR_MESSAGES));
  }
  revalidatePanel();
  return ACTION_OK;
}
