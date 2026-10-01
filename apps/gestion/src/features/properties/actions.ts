'use server';

import {
  CreatePropertyInputSchema,
  PropertyIdInputSchema,
  type CreatePropertyInput,
  type PropertyIdInput,
} from '@norde/core/properties/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { PROPERTY_ERROR_MESSAGES } from './messages';

const PROPERTIES_PATH = '/propiedades';
const INVALID = PROPERTY_ERROR_MESSAGES.InvalidInput;

/** Alta corta: responde con el código asignado, para avisarlo al volver al buscador. */
export async function createPropertyAction(
  input: CreatePropertyInput,
): Promise<ActionResult & { readonly code?: string }> {
  const { actor } = await requireSession();
  const parsed = CreatePropertyInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().properties.createProperty.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, PROPERTY_ERROR_MESSAGES));
  revalidatePath(PROPERTIES_PATH);
  return { ...ACTION_OK, code: result.value.code };
}

export async function deletePropertyAction(input: PropertyIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = PropertyIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().properties.deleteProperty.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, PROPERTY_ERROR_MESSAGES));
  revalidatePath(PROPERTIES_PATH);
  return ACTION_OK;
}

export async function restorePropertyAction(input: PropertyIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = PropertyIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().properties.restoreProperty.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, PROPERTY_ERROR_MESSAGES));
  revalidatePath(PROPERTIES_PATH);
  return ACTION_OK;
}
