'use server';

import {
  CheckClientDuplicatesInputSchema,
  ClientIdInputSchema,
  CreateClientInputSchema,
  ReassignClientInputSchema,
  UpdateClientDetailsInputSchema,
  type CheckClientDuplicatesInput,
  type ClientDuplicates,
  type ClientIdInput,
  type CreateClientInput,
  type ReassignClientInput,
  type UpdateClientDetailsInput,
} from '@norde/core/clients/contracts';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  CHECK_DUPLICATES_ERROR_MESSAGES,
  CREATE_CLIENT_ERROR_MESSAGES,
  DELETE_CLIENT_ERROR_MESSAGES,
  REASSIGN_CLIENT_ERROR_MESSAGES,
  RESTORE_CLIENT_ERROR_MESSAGES,
  UPDATE_CLIENT_ERROR_MESSAGES,
} from './messages';

const CONTACTS_PATH = '/contactos';

function contactPath(clientId: string): string {
  return `${CONTACTS_PATH}/${clientId}`;
}

/** Antes del alta: si ya existe uno con esos datos, o uno con el mismo nombre. */
export async function checkClientDuplicatesAction(
  input: CheckClientDuplicatesInput,
): Promise<
  ({ readonly ok: true } & ClientDuplicates) | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = CheckClientDuplicatesInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: CHECK_DUPLICATES_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().clients.checkClientDuplicates.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, CHECK_DUPLICATES_ERROR_MESSAGES) };
  }
  return { ok: true, ...result.value };
}

export async function createClientAction(
  input: CreateClientInput,
): Promise<ActionResult & { readonly clientId?: string }> {
  const { actor } = await requireSession();
  const parsed = CreateClientInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_CLIENT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.createClient.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CREATE_CLIENT_ERROR_MESSAGES));
  }
  revalidatePath(CONTACTS_PATH);
  return { ...ACTION_OK, clientId: result.value.clientId };
}

export async function updateClientDetailsAction(
  input: UpdateClientDetailsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateClientDetailsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_CLIENT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.updateClientDetails.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UPDATE_CLIENT_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return ACTION_OK;
}

export async function reassignClientAction(input: ReassignClientInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ReassignClientInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(REASSIGN_CLIENT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.reassignClient.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, REASSIGN_CLIENT_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  return ACTION_OK;
}

export async function deleteClientAction(input: ClientIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ClientIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DELETE_CLIENT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.deleteClient.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DELETE_CLIENT_ERROR_MESSAGES));
  }
  revalidatePath(CONTACTS_PATH, 'layout');
  return ACTION_OK;
}

export async function restoreClientAction(input: ClientIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ClientIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(RESTORE_CLIENT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.restoreClient.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, RESTORE_CLIENT_ERROR_MESSAGES));
  }
  revalidatePath(CONTACTS_PATH, 'layout');
  return ACTION_OK;
}
