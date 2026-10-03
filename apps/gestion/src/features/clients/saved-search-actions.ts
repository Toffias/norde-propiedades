'use server';

import {
  CreateSavedSearchInputSchema,
  SavedSearchRefInputSchema,
  UpdateSavedSearchInputSchema,
  type CreateSavedSearchInput,
  type SavedSearchRefInput,
  type UpdateSavedSearchInput,
} from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  CREATE_SAVED_SEARCH_ERROR_MESSAGES,
  DELETE_SAVED_SEARCH_ERROR_MESSAGES,
  RESTORE_SAVED_SEARCH_ERROR_MESSAGES,
  UPDATE_SAVED_SEARCH_ERROR_MESSAGES,
} from './messages';

// Las búsquedas guardadas de un contacto (#11): desde su ficha y desde el buscador de propiedades.

function contactPath(clientId: string): string {
  return `/contactos/${clientId}`;
}

export async function createSavedSearchAction(
  input: CreateSavedSearchInput,
): Promise<ActionResult & { readonly savedSearchId?: string }> {
  const { actor } = await requireSession();
  const parsed = CreateSavedSearchInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_SAVED_SEARCH_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.createSavedSearch.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CREATE_SAVED_SEARCH_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return { ...ACTION_OK, savedSearchId: result.value.savedSearchId };
}

export async function updateSavedSearchAction(
  input: UpdateSavedSearchInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateSavedSearchInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_SAVED_SEARCH_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.updateSavedSearch.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UPDATE_SAVED_SEARCH_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return ACTION_OK;
}

export async function deleteSavedSearchAction(input: SavedSearchRefInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SavedSearchRefInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DELETE_SAVED_SEARCH_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.deleteSavedSearch.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DELETE_SAVED_SEARCH_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return ACTION_OK;
}

export async function restoreSavedSearchAction(input: SavedSearchRefInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SavedSearchRefInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(RESTORE_SAVED_SEARCH_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.restoreSavedSearch.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, RESTORE_SAVED_SEARCH_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return ACTION_OK;
}
