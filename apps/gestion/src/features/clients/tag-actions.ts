'use server';

import {
  ChangeClientTagsInputSchema,
  ClientTagGroupIdInputSchema,
  ClientTagIdInputSchema,
  CreateClientTagGroupInputSchema,
  CreateClientTagInputSchema,
  MergeClientTagsInputSchema,
  RenameClientTagGroupInputSchema,
  UpdateClientTagInputSchema,
  type ChangeClientTagsInput,
  type ClientTagGroupIdInput,
  type ClientTagIdInput,
  type CreateClientTagGroupInput,
  type CreateClientTagInput,
  type MergeClientTagsInput,
  type RenameClientTagGroupInput,
  type UpdateClientTagInput,
} from '@norde/core/clients/contracts';
import type { ComboboxPage } from '@norde/ui/components/paged-combobox';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  CHANGE_CLIENT_TAGS_ERROR_MESSAGES,
  CREATE_CLIENT_TAG_ERROR_MESSAGES,
  CREATE_CLIENT_TAG_GROUP_ERROR_MESSAGES,
  DELETE_CLIENT_TAG_ERROR_MESSAGES,
  DELETE_CLIENT_TAG_GROUP_ERROR_MESSAGES,
  MERGE_CLIENT_TAGS_ERROR_MESSAGES,
  RENAME_CLIENT_TAG_GROUP_ERROR_MESSAGES,
  UPDATE_CLIENT_TAG_ERROR_MESSAGES,
} from './messages';

// Etiquetas de contactos: el catálogo (grupos y etiquetas) y las etiquetas de cada contacto.

const TAGS_PATH = '/contactos/etiquetas';
const PICKER_PAGE_SIZE = 20;

/** Las grillas de etiquetas y la agenda (filtro y contadores) cambian juntas. */
function revalidateTags(): void {
  revalidatePath('/contactos', 'layout');
}

export async function createClientTagGroupAction(
  input: CreateClientTagGroupInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateClientTagGroupInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_CLIENT_TAG_GROUP_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.createClientTagGroup.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CREATE_CLIENT_TAG_GROUP_ERROR_MESSAGES));
  }
  revalidatePath(`${TAGS_PATH}/grupos`);
  return ACTION_OK;
}

export async function renameClientTagGroupAction(
  input: RenameClientTagGroupInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RenameClientTagGroupInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(RENAME_CLIENT_TAG_GROUP_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.renameClientTagGroup.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, RENAME_CLIENT_TAG_GROUP_ERROR_MESSAGES));
  }
  revalidateTags();
  return ACTION_OK;
}

export async function deleteClientTagGroupAction(
  input: ClientTagGroupIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ClientTagGroupIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DELETE_CLIENT_TAG_GROUP_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.deleteClientTagGroup.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DELETE_CLIENT_TAG_GROUP_ERROR_MESSAGES));
  }
  revalidatePath(`${TAGS_PATH}/grupos`);
  return ACTION_OK;
}

export async function createClientTagAction(input: CreateClientTagInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = CreateClientTagInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CREATE_CLIENT_TAG_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.createClientTag.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CREATE_CLIENT_TAG_ERROR_MESSAGES));
  }
  revalidateTags();
  return ACTION_OK;
}

export async function updateClientTagAction(input: UpdateClientTagInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateClientTagInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(UPDATE_CLIENT_TAG_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.updateClientTag.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, UPDATE_CLIENT_TAG_ERROR_MESSAGES));
  }
  revalidateTags();
  return ACTION_OK;
}

export async function deleteClientTagAction(input: ClientTagIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ClientTagIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(DELETE_CLIENT_TAG_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.deleteClientTag.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DELETE_CLIENT_TAG_ERROR_MESSAGES));
  }
  revalidateTags();
  return ACTION_OK;
}

export async function mergeClientTagsAction(
  input: MergeClientTagsInput,
): Promise<ActionResult & { readonly moved?: number }> {
  const { actor } = await requireSession();
  const parsed = MergeClientTagsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(MERGE_CLIENT_TAGS_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.mergeClientTags.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, MERGE_CLIENT_TAGS_ERROR_MESSAGES));
  }
  revalidateTags();
  return { ...ACTION_OK, moved: result.value.moved };
}

export async function changeClientTagsAction(input: ChangeClientTagsInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangeClientTagsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(CHANGE_CLIENT_TAGS_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().clients.changeClientTags.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, CHANGE_CLIENT_TAGS_ERROR_MESSAGES));
  }
  revalidatePath(`/contactos/${parsed.data.clientId}`);
  return ACTION_OK;
}

/** Selector de etiquetas (ficha, filtro, unificar): una página que coincide con la búsqueda. */
export async function loadClientTagOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().clients.searchClientTags.execute(
    { page, pageSize: PICKER_PAGE_SIZE, ...(search.trim() === '' ? {} : { q: search }) },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the client tags: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map((tag) => ({
      value: tag.id,
      label: tag.name,
      ...(tag.groupName === undefined ? {} : { hint: tag.groupName }),
    })),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}

/** Selector de grupo de una etiqueta. */
export async function loadClientTagGroupOptions(
  search: string,
  page: number,
): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().clients.listClientTagGroups.execute(
    {
      page,
      pageSize: PICKER_PAGE_SIZE,
      sort: 'name',
      ...(search.trim() === '' ? {} : { q: search }),
    },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the tag groups: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map((group) => ({ value: group.id, label: group.name })),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}
