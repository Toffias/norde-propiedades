'use server';

import {
  ChangeOpportunityStageInputSchema,
  CloseOpportunityInputSchema,
  ListOpportunitiesQuerySchema,
  ListOpportunityHistoryQuerySchema,
  ReassignOpportunityInputSchema,
  type ChangeOpportunityStageInput,
  type ClientActivityRow,
  type CloseOpportunityInput,
  type ListOpportunitiesQuery,
  type ListOpportunityHistoryQuery,
  type OpportunityPipelineRow,
  type ReassignOpportunityInput,
} from '@norde/core/clients/contracts';
import type { Page } from '@norde/core/shared';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';

import {
  CHANGE_STAGE_ERROR_MESSAGES,
  CLOSE_OPPORTUNITY_ERROR_MESSAGES,
  LIST_OPPORTUNITIES_ERROR_MESSAGES,
  LIST_OPPORTUNITY_HISTORY_ERROR_MESSAGES,
  REASSIGN_OPPORTUNITY_ERROR_MESSAGES,
} from './messages';

// Acciones sobre una oportunidad: desde el pipeline y desde la ficha del contacto. Revalidan el
// layout entero porque el contador del menú (nuevas asignadas) puede cambiar. Las de lectura traen
// una página más de una columna del tablero o del historial, sin tocar la URL.

type PageActionResult<T> =
  { readonly ok: true; readonly value: Page<T> } | Extract<ActionResult, { readonly ok: false }>;

function pageFailed(message: string): Extract<ActionResult, { readonly ok: false }> {
  return { ok: false, message };
}

/** La página siguiente de una columna del tablero, con los mismos filtros y orden. */
export async function loadOpportunityColumnAction(
  input: ListOpportunitiesQuery,
): Promise<PageActionResult<OpportunityPipelineRow>> {
  const { actor } = await requireSession();
  const parsed = ListOpportunitiesQuerySchema.safeParse(input);
  if (!parsed.success) return pageFailed(LIST_OPPORTUNITIES_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.listOpportunities.execute(parsed.data, actor);
  if (result.isErr()) {
    return pageFailed(messageForError(result.error, LIST_OPPORTUNITIES_ERROR_MESSAGES));
  }
  return { ok: true, value: result.value };
}

/** Una página del historial de una oportunidad, filtrada por tipo. */
export async function loadOpportunityHistoryAction(
  input: ListOpportunityHistoryQuery,
): Promise<PageActionResult<ClientActivityRow>> {
  const { actor } = await requireSession();
  const parsed = ListOpportunityHistoryQuerySchema.safeParse(input);
  if (!parsed.success) return pageFailed(LIST_OPPORTUNITY_HISTORY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.listOpportunityHistory.execute(parsed.data, actor);
  if (result.isErr()) {
    return pageFailed(messageForError(result.error, LIST_OPPORTUNITY_HISTORY_ERROR_MESSAGES));
  }
  return { ok: true, value: result.value };
}

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
