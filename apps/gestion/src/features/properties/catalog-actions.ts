'use server';

import {
  CreateFeatureInputSchema,
  CreateLocationInputSchema,
  CreateTagGroupInputSchema,
  CreateTagInputSchema,
  RenameLocationInputSchema,
  RenameTagGroupInputSchema,
  TagGroupIdInputSchema,
  TagIdInputSchema,
  UpdateFeatureInputSchema,
  UpdateGridColumnsInputSchema,
  UpdatePropertyTypeSettingInputSchema,
  UpdateTagInputSchema,
  type CreateFeatureInput,
  type CreateLocationInput,
  type CreateTagGroupInput,
  type CreateTagInput,
  type RenameLocationInput,
  type RenameTagGroupInput,
  type TagGroupIdInput,
  type TagIdInput,
  type UpdateFeatureInput,
  type UpdateGridColumnsInput,
  type UpdatePropertyTypeSettingInput,
  type UpdateTagInput,
} from '@norde/core/properties/contracts';
import type { Actor, Result } from '@norde/core/shared';
import type { ComboboxPage } from '@norde/ui/components/paged-combobox';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';

import { getContainer, type PropertiesUseCases } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import { CATALOG_ERROR_MESSAGES, type CatalogError } from './messages';

// Mi empresa → Propiedades, Ubicaciones, Servicios y ambientes, y Etiquetas de propiedades.

const COMPANY_PATH = '/mi-empresa';
const PICKER_PAGE_SIZE = 20;

/** Valida con el contract, corre el caso de uso y revalida Mi empresa (y el buscador). */
async function runCatalog<S extends z.ZodType>(
  schema: S,
  input: unknown,
  pick: (useCases: PropertiesUseCases) => {
    execute(input: z.output<S>, actor: Actor): Promise<Result<unknown, CatalogError>>;
  },
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return actionFailed(CATALOG_ERROR_MESSAGES.InvalidInput);

  const result = await pick(getContainer().properties).execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, CATALOG_ERROR_MESSAGES));
  revalidatePath(COMPANY_PATH, 'layout');
  revalidatePath('/propiedades');
  return ACTION_OK;
}

export async function createLocationAction(input: CreateLocationInput): Promise<ActionResult> {
  return runCatalog(CreateLocationInputSchema, input, (p) => p.createLocation);
}

export async function renameLocationAction(input: RenameLocationInput): Promise<ActionResult> {
  return runCatalog(RenameLocationInputSchema, input, (p) => p.renameLocation);
}

export async function createFeatureAction(input: CreateFeatureInput): Promise<ActionResult> {
  return runCatalog(CreateFeatureInputSchema, input, (p) => p.createFeature);
}

export async function updateFeatureAction(input: UpdateFeatureInput): Promise<ActionResult> {
  return runCatalog(UpdateFeatureInputSchema, input, (p) => p.updateFeature);
}

export async function createTagGroupAction(input: CreateTagGroupInput): Promise<ActionResult> {
  return runCatalog(CreateTagGroupInputSchema, input, (p) => p.createTagGroup);
}

export async function renameTagGroupAction(input: RenameTagGroupInput): Promise<ActionResult> {
  return runCatalog(RenameTagGroupInputSchema, input, (p) => p.renameTagGroup);
}

export async function deleteTagGroupAction(input: TagGroupIdInput): Promise<ActionResult> {
  return runCatalog(TagGroupIdInputSchema, input, (p) => p.deleteTagGroup);
}

export async function createTagAction(input: CreateTagInput): Promise<ActionResult> {
  return runCatalog(CreateTagInputSchema, input, (p) => p.createTag);
}

export async function updateTagAction(input: UpdateTagInput): Promise<ActionResult> {
  return runCatalog(UpdateTagInputSchema, input, (p) => p.updateTag);
}

export async function deleteTagAction(input: TagIdInput): Promise<ActionResult> {
  return runCatalog(TagIdInputSchema, input, (p) => p.deleteTag);
}

export async function updatePropertyTypeSettingAction(
  input: UpdatePropertyTypeSettingInput,
): Promise<ActionResult> {
  return runCatalog(
    UpdatePropertyTypeSettingInputSchema,
    input,
    (p) => p.updatePropertyTypeSetting,
  );
}

export async function updateGridColumnsAction(
  input: UpdateGridColumnsInput,
): Promise<ActionResult> {
  return runCatalog(UpdateGridColumnsInputSchema, input, (p) => p.updateGridColumns);
}

/** Selector de grupo de etiquetas (alta y edición de etiquetas). */
export async function loadTagGroupOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().properties.listTagGroups.execute(
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
