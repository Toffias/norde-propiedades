'use server';

import {
  CheckClientDuplicatesInputSchema,
  ClientIdInputSchema,
  CreateClientInputSchema,
  EraseClientDataInputSchema,
  LinkClientsInputSchema,
  MergeClientsInputSchema,
  PreviewClientMergeInputSchema,
  ReassignClientInputSchema,
  UnlinkClientsInputSchema,
  UpdateClientDetailsInputSchema,
  type CheckClientDuplicatesInput,
  type ClientDuplicates,
  type ClientIdInput,
  type ClientKindValue,
  type ClientMergePreview,
  type CreateClientInput,
  type EraseClientDataInput,
  type LinkClientsInput,
  type MergeClientsInput,
  type PreviewClientMergeInput,
  type ReassignClientInput,
  type UnlinkClientsInput,
  type UpdateClientDetailsInput,
} from '@norde/core/clients/contracts';
import type { ComboboxPage } from '@norde/ui/components/paged-combobox';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { clientName, formatPhone } from './client-format';
import {
  CHECK_DUPLICATES_ERROR_MESSAGES,
  CREATE_CLIENT_ERROR_MESSAGES,
  DELETE_CLIENT_ERROR_MESSAGES,
  ERASE_CLIENT_ERROR_MESSAGES,
  LINK_CLIENTS_ERROR_MESSAGES,
  MERGE_CLIENTS_ERROR_MESSAGES,
  PREVIEW_MERGE_ERROR_MESSAGES,
  REASSIGN_CLIENT_ERROR_MESSAGES,
  RESTORE_CLIENT_ERROR_MESSAGES,
  UNLINK_CLIENTS_ERROR_MESSAGES,
  UPDATE_CLIENT_ERROR_MESSAGES,
} from './messages';

const CONTACTS_PATH = '/contactos';
const PICKER_PAGE_SIZE = 20;

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

/**
 * Supresión de datos (Ley 25.326): borra el contacto y todo lo suyo, sin papelera. La ficha deja
 * de existir, así que se refresca toda la agenda.
 */
export async function eraseClientDataAction(input: EraseClientDataInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = EraseClientDataInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(ERASE_CLIENT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.eraseClientData.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, ERASE_CLIENT_ERROR_MESSAGES));
  }
  revalidatePath(CONTACTS_PATH, 'layout');
  return ACTION_OK;
}

// ---------- Contactos relacionados ----------

export async function linkClientsAction(input: LinkClientsInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = LinkClientsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(LINK_CLIENTS_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.linkClients.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, LINK_CLIENTS_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  revalidatePath(contactPath(parsed.data.relatedClientId));
  return ACTION_OK;
}

export async function unlinkClientsAction(input: UnlinkClientsInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UnlinkClientsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UNLINK_CLIENTS_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.unlinkClients.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UNLINK_CLIENTS_ERROR_MESSAGES));
  }
  revalidatePath(contactPath(parsed.data.clientId));
  revalidatePath(contactPath(parsed.data.relatedClientId));
  return ACTION_OK;
}

/**
 * Selector de contactos (relacionar, unificar): una página de contactos activos que el actor ve,
 * por nombre, teléfono o email. Con `kind`, solo empresas o solo grupos.
 */
export async function loadClientOptions(
  search: string,
  page: number,
  kind?: ClientKindValue,
): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().clients.listClients.execute(
    {
      page,
      pageSize: PICKER_PAGE_SIZE,
      sort: 'name',
      ...(search.trim() === '' ? {} : { q: search }),
      ...(kind === undefined ? {} : { kind }),
    },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the contacts: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map((client) => {
      const phone = client.mobile ?? client.phone;
      // Un teléfono enmascarado (propietario) ya viene con su formato.
      const hint =
        client.companyName ??
        client.email ??
        (phone === undefined || client.contactMasked ? phone : formatPhone(phone));
      return {
        value: client.id,
        label: clientName(client.name),
        ...(hint === undefined ? {} : { hint }),
      };
    }),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}

// ---------- Unificar ----------

export async function previewClientMergeAction(
  input: PreviewClientMergeInput,
): Promise<
  | { readonly ok: true; readonly preview: ClientMergePreview }
  | { readonly ok: false; readonly message: string }
> {
  const { actor } = await requireSession();
  const parsed = PreviewClientMergeInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: PREVIEW_MERGE_ERROR_MESSAGES.InvalidInput };

  const result = await getContainer().clients.previewClientMerge.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, PREVIEW_MERGE_ERROR_MESSAGES) };
  }
  return { ok: true, preview: result.value };
}

export async function mergeClientsAction(
  input: MergeClientsInput,
): Promise<ActionResult & { readonly clientId?: string }> {
  const { actor } = await requireSession();
  const parsed = MergeClientsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(MERGE_CLIENTS_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.mergeClients.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, MERGE_CLIENTS_ERROR_MESSAGES));
  }
  revalidatePath(CONTACTS_PATH, 'layout');
  return { ...ACTION_OK, clientId: result.value.clientId };
}
