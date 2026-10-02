'use server';

import {
  AddClientNoteInputSchema,
  FeaturePropertiesInputSchema,
  UnfeaturePropertyInputSchema,
  type AddClientNoteInput,
  type FeaturePropertiesInput,
  type UnfeaturePropertyInput,
} from '@norde/core/clients/contracts';
import { FavoritesInputSchema } from '@norde/core/identity/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  ADD_NOTE_ERROR_MESSAGES,
  CLIENT_FAVORITE_ERROR_MESSAGES,
  FEATURE_PROPERTIES_ERROR_MESSAGES,
  UNFEATURE_PROPERTY_ERROR_MESSAGES,
} from './messages';

// Lo que se hace desde la ficha del contacto (#8, etapa 3): notas, destacadas y favorito.

function contactPath(clientId: string): string {
  return `/contactos/${clientId}`;
}

export async function addClientNoteAction(input: AddClientNoteInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = AddClientNoteInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(ADD_NOTE_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.addClientNote.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, ADD_NOTE_ERROR_MESSAGES));
  revalidatePath(contactPath(parsed.data.clientId));
  // La nota de una oportunidad es la última nota de su tarjeta en el pipeline.
  if (parsed.data.opportunityId !== undefined) revalidatePath('/oportunidades');
  return ACTION_OK;
}

export async function featurePropertiesAction(
  input: FeaturePropertiesInput,
): Promise<ActionResult & { readonly featured?: number }> {
  const { actor } = await requireSession();
  const parsed = FeaturePropertiesInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(FEATURE_PROPERTIES_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.featureProperties.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, FEATURE_PROPERTIES_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return { ...ACTION_OK, featured: result.value.featured };
}

export async function unfeaturePropertyAction(
  input: UnfeaturePropertyInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UnfeaturePropertyInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UNFEATURE_PROPERTY_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.unfeatureProperty.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UNFEATURE_PROPERTY_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return ACTION_OK;
}

/** Marca o desmarca el contacto como favorito de quien lo pide. */
export async function setClientFavoriteAction(input: {
  readonly clientId: string;
  readonly favorite: boolean;
}): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = FavoritesInputSchema.safeParse({ entityType: 'client', ids: [input.clientId] });
  if (!parsed.success) return actionFailed(CLIENT_FAVORITE_ERROR_MESSAGES.InvalidInput);

  const { identity } = getContainer();
  const useCase = input.favorite ? identity.addFavorites : identity.removeFavorites;
  const result = await useCase.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CLIENT_FAVORITE_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(input.clientId));
  return ACTION_OK;
}
