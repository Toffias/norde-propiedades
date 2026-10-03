'use server';

import { FavoritesInputSchema } from '@norde/core/identity/contracts';
import {
  ChangeDevelopmentStatusInputSchema,
  ChangeDevelopmentTagsInputSchema,
  CreateDevelopmentInputSchema,
  CreateDevelopmentUnitInputSchema,
  DevelopmentIdInputSchema,
  DevelopmentMapQuerySchema,
  UpdateDevelopmentDetailsInputSchema,
  UpdateDevelopmentFeaturesInputSchema,
  UpdateDevelopmentGeneralInputSchema,
  UpdateDevelopmentLocationInputSchema,
  type ChangeDevelopmentStatusInput,
  type ChangeDevelopmentTagsInput,
  type CreateDevelopmentInput,
  type CreateDevelopmentUnitInput,
  type DevelopmentDetail,
  type DevelopmentIdInput,
  type DevelopmentMapQuery,
  type DevelopmentMapResult,
  type GeocodingOutcome,
  type MediaRow,
  type UpdateDevelopmentDetailsInput,
  type UpdateDevelopmentFeaturesInput,
  type UpdateDevelopmentGeneralInput,
  type UpdateDevelopmentLocationInput,
} from '@norde/core/properties/contracts';
import type { Result } from '@norde/core/shared';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError, type ErrorMessages, type ExpectedError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  DEVELOPMENT_ERROR_MESSAGES,
  DEVELOPMENT_FAVORITE_ERROR_MESSAGES,
  DEVELOPMENT_LIST_ERROR_MESSAGES,
  DEVELOPMENT_READ_ERROR_MESSAGES,
  DEVELOPMENT_UNIT_ERROR_MESSAGES,
} from './messages';

// Server Actions de emprendimientos (#7): una por caso de uso.

const DEVELOPMENTS_PATH = '/emprendimientos';
const INVALID = DEVELOPMENT_ERROR_MESSAGES.InvalidInput;

function developments() {
  return getContainer().properties;
}

/** Mapea el resultado a la respuesta de la UI y revalida el listado y la ficha. */
function done<E extends ExpectedError>(
  result: Result<unknown, E>,
  messages: Partial<ErrorMessages<E>>,
  developmentId: string,
): ActionResult {
  if (result.isErr()) return actionFailed(messageForError(result.error, messages));
  revalidatePath(DEVELOPMENTS_PATH);
  revalidatePath(`${DEVELOPMENTS_PATH}/${developmentId}`);
  return ACTION_OK;
}

/** Alta: responde con el ID, el código y qué pasó con las coordenadas, para abrir la ficha. */
export async function createDevelopmentAction(input: CreateDevelopmentInput): Promise<
  ActionResult & {
    readonly developmentId?: string;
    readonly code?: string;
    readonly geocoding?: GeocodingOutcome;
  }
> {
  const { actor } = await requireSession();
  const parsed = CreateDevelopmentInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await developments().createDevelopment.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DEVELOPMENT_ERROR_MESSAGES));
  }
  revalidatePath(DEVELOPMENTS_PATH);
  return { ...ACTION_OK, ...result.value };
}

export async function deleteDevelopmentAction(input: DevelopmentIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = DevelopmentIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().deleteDevelopment.execute(parsed.data, actor);
  return done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
}

export async function restoreDevelopmentAction(input: DevelopmentIdInput): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = DevelopmentIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().restoreDevelopment.execute(parsed.data, actor);
  return done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
}

export async function updateDevelopmentGeneralAction(
  input: UpdateDevelopmentGeneralInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateDevelopmentGeneralInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().updateDevelopmentGeneral.execute(parsed.data, actor);
  return done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
}

export async function updateDevelopmentLocationAction(
  input: UpdateDevelopmentLocationInput,
): Promise<ActionResult & { readonly geocoding?: GeocodingOutcome | 'unchanged' }> {
  const { actor } = await requireSession();
  const parsed = UpdateDevelopmentLocationInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().updateDevelopmentLocation.execute(parsed.data, actor);
  const outcome = done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
  return result.isOk() ? { ...outcome, geocoding: result.value.geocoding } : outcome;
}

export async function updateDevelopmentDetailsAction(
  input: UpdateDevelopmentDetailsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateDevelopmentDetailsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().updateDevelopmentDetails.execute(parsed.data, actor);
  return done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
}

export async function changeDevelopmentStatusAction(
  input: ChangeDevelopmentStatusInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangeDevelopmentStatusInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().changeDevelopmentStatus.execute(parsed.data, actor);
  return done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
}

export async function updateDevelopmentFeaturesAction(
  input: UpdateDevelopmentFeaturesInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = UpdateDevelopmentFeaturesInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().updateDevelopmentFeatures.execute(parsed.data, actor);
  return done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
}

export async function changeDevelopmentTagsAction(
  input: ChangeDevelopmentTagsInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = ChangeDevelopmentTagsInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().changeDevelopmentTags.execute(parsed.data, actor);
  return done(result, DEVELOPMENT_ERROR_MESSAGES, parsed.data.developmentId);
}

/** Alta de una unidad: responde con su código; la grilla de unidades se revalida. */
export async function createDevelopmentUnitAction(
  input: CreateDevelopmentUnitInput,
): Promise<ActionResult & { readonly propertyId?: string; readonly code?: string }> {
  const { actor } = await requireSession();
  const parsed = CreateDevelopmentUnitInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);
  const result = await developments().createDevelopmentUnit.execute(parsed.data, actor);
  const outcome = done(result, DEVELOPMENT_UNIT_ERROR_MESSAGES, parsed.data.developmentId);
  if (result.isErr()) return outcome;
  revalidatePath('/propiedades');
  return { ...outcome, ...result.value };
}

// ---------- Mapa y favoritos ----------

type ActionResultFailure = Extract<ActionResult, { readonly ok: false }>;

/** Los pines del área visible del mapa, con los filtros del listado. */
export async function loadDevelopmentMapPinsAction(
  query: DevelopmentMapQuery,
): Promise<{ readonly ok: true; readonly value: DevelopmentMapResult } | ActionResultFailure> {
  const { actor } = await requireSession();
  const parsed = DevelopmentMapQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { ok: false, message: DEVELOPMENT_LIST_ERROR_MESSAGES.InvalidSearch };
  }
  const result = await developments().getDevelopmentMap.execute(parsed.data, actor);
  if (result.isErr()) {
    return { ok: false, message: messageForError(result.error, DEVELOPMENT_LIST_ERROR_MESSAGES) };
  }
  return { ok: true, value: result.value };
}

/** Marca o desmarca el emprendimiento como favorito de quien usa el panel. */
export async function setDevelopmentFavoriteAction(input: {
  readonly developmentId: string;
  readonly favorite: boolean;
}): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = FavoritesInputSchema.safeParse({
    entityType: 'development',
    ids: [input.developmentId],
  });
  if (!parsed.success) return actionFailed(DEVELOPMENT_FAVORITE_ERROR_MESSAGES.InvalidInput);

  const { identity } = getContainer();
  const useCase = input.favorite ? identity.addFavorites : identity.removeFavorites;
  const result = await useCase.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, DEVELOPMENT_FAVORITE_ERROR_MESSAGES));
  }
  revalidatePath(DEVELOPMENTS_PATH);
  revalidatePath(`${DEVELOPMENTS_PATH}/${input.developmentId}`);
  return ACTION_OK;
}

/** Lo que muestra la vista rápida del listado: la ficha, las primeras fotos y los archivos. */
export interface DevelopmentQuickView {
  readonly detail: DevelopmentDetail;
  readonly photos: readonly MediaRow[];
  readonly attachmentCount: number;
  readonly favorite: boolean;
  /** Puede descargar el Excel de unidades (`properties:export`). */
  readonly canExportUnits: boolean;
}

/** Fotos que entran en el carrusel de la vista rápida; el resto, en la ficha. */
const QUICK_VIEW_PHOTOS = 12;

export async function loadDevelopmentQuickViewAction(
  input: DevelopmentIdInput,
): Promise<{ readonly ok: true; readonly value: DevelopmentQuickView } | ActionResultFailure> {
  const { actor } = await requireSession();
  const parsed = DevelopmentIdInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: DEVELOPMENT_READ_ERROR_MESSAGES.InvalidInput };
  const { developmentId } = parsed.data;
  const owner = { kind: 'development', id: developmentId } as const;
  const { properties, identity } = getContainer();
  const [detail, photos, attachments, favorites] = await Promise.all([
    properties.getDevelopmentDetail.execute({ developmentId }, actor),
    properties.listMedia.execute({ owner, kind: 'images', pageSize: QUICK_VIEW_PHOTOS }, actor),
    properties.listAttachments.execute({ owner, pageSize: 1 }, actor),
    identity.getFavoriteIds.execute({ entityType: 'development', ids: [developmentId] }, actor),
  ]);
  if (detail.isErr()) {
    return { ok: false, message: messageForError(detail.error, DEVELOPMENT_READ_ERROR_MESSAGES) };
  }
  return {
    ok: true,
    value: {
      detail: detail.value,
      photos: photos.isOk() ? photos.value.items : [],
      attachmentCount: attachments.isOk() ? attachments.value.total : 0,
      favorite: favorites.isOk() && favorites.value.has(developmentId),
      canExportUnits: actor.can('properties:export') || actor.can('properties:export-bulk'),
    },
  };
}
