'use server';

import { FavoritesInputSchema } from '@norde/core/identity/contracts';
import {
  BulkEditPropertiesInputSchema,
  CreatePropertyInputSchema,
  FavoriteSearchIdInputSchema,
  PropertyIdInputSchema,
  SHOWCASE_OPTION_DEFAULTS,
  PropertyMapQuerySchema,
  RequestPropertyListDocumentInputSchema,
  SaveFavoriteSearchInputSchema,
  type BulkEditPropertiesInput,
  type BulkEditResult,
  type CreatePropertyInput,
  type FavoriteSearchIdInput,
  type GeocodingOutcome,
  type PanelPropertyDetail,
  type PropertyIdInput,
  type PropertyMapQuery,
  type PdfExportOptions,
  type PropertyMapResult,
  type RequestPropertyListDocumentInput,
  type SaveFavoriteSearchInput,
} from '@norde/core/properties/contracts';
import type { ComboboxPage } from '@norde/ui/components/paged-combobox';
import { revalidatePath } from 'next/cache';

import { getContainer } from '../../container';
import { MEDIA_LIST_ERROR_MESSAGES } from '../media/messages';
import { ACTION_OK, actionFailed, type ActionResult } from '../../lib/action-result';
import { messageForError } from '../../lib/errors';
import { requireSession } from '../../lib/session';
import {
  BULK_EDIT_ERROR_MESSAGES,
  FAVORITE_ERROR_MESSAGES,
  FAVORITE_SEARCH_ERROR_MESSAGES,
  LIST_DOCUMENT_ERROR_MESSAGES,
  PROPERTY_ERROR_MESSAGES,
  PROPERTY_MAP_ERROR_MESSAGES,
} from './messages';
import { DETAIL_READ_ERROR_MESSAGES } from './detail-messages';
import { locationOption } from './property-format';

/** Opciones por página de los selectores paginados. */
const PICKER_PAGE_SIZE = 20;

const PROPERTIES_PATH = '/propiedades';
const INVALID = PROPERTY_ERROR_MESSAGES.InvalidInput;

/**
 * Alta corta: responde con el código asignado y qué pasó con las coordenadas, para avisarlo al
 * volver al buscador.
 */
export async function createPropertyAction(
  input: CreatePropertyInput,
): Promise<ActionResult & { readonly code?: string; readonly geocoding?: GeocodingOutcome }> {
  const { actor } = await requireSession();
  const parsed = CreatePropertyInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(INVALID);

  const result = await getContainer().properties.createProperty.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, PROPERTY_ERROR_MESSAGES));
  revalidatePath(PROPERTIES_PATH);
  return { ...ACTION_OK, code: result.value.code, geocoding: result.value.geocoding };
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

// --- Mapa ---

/** Pines del área visible del mapa con los filtros del buscador. */
export async function loadMapPinsAction(
  query: PropertyMapQuery,
): Promise<{ readonly ok: true; readonly value: PropertyMapResult } | ActionResultFailure> {
  const { actor } = await requireSession();
  const parsed = PropertyMapQuerySchema.safeParse(query);
  if (!parsed.success) return failed(PROPERTY_MAP_ERROR_MESSAGES.InvalidSearch);

  const result = await getContainer().properties.getPropertyMap.execute(parsed.data, actor);
  if (result.isErr()) return failed(messageForError(result.error, PROPERTY_MAP_ERROR_MESSAGES));
  return { ok: true, value: result.value };
}

// --- Vistazo ---

/** Cuántas fotos muestra el vistazo: para recorrer más, está la ficha. */
const QUICK_VIEW_PHOTOS = 30;

/** Lo que muestra el vistazo de una propiedad desde el buscador. */
export interface PropertyQuickView {
  readonly detail: Pick<
    PanelPropertyDetail,
    | 'id'
    | 'code'
    | 'propertyType'
    | 'status'
    | 'portalTitle'
    | 'publishAddress'
    | 'description'
    | 'locationPath'
    | 'operations'
    | 'characteristics'
    | 'producer'
    | 'development'
  >;
  /** Fotos y planos ya procesados, en el orden de la galería. */
  readonly photoIds: readonly string[];
  /** Todas las fotos y planos de la propiedad, aunque el vistazo muestre solo las primeras. */
  readonly totalPhotos: number;
}

/** El vistazo de una fila del buscador: datos clave, descripción y las primeras fotos. */
export async function loadPropertyQuickViewAction(
  input: PropertyIdInput,
): Promise<{ readonly ok: true; readonly value: PropertyQuickView } | ActionResultFailure> {
  const { actor } = await requireSession();
  const parsed = PropertyIdInputSchema.safeParse(input);
  if (!parsed.success) return failed(DETAIL_READ_ERROR_MESSAGES.InvalidInput);

  const { properties } = getContainer();
  const [detail, media] = await Promise.all([
    properties.getPanelPropertyDetail.execute(parsed.data, actor),
    properties.listMedia.execute(
      {
        owner: { kind: 'property', id: parsed.data.propertyId },
        kind: 'images',
        pageSize: QUICK_VIEW_PHOTOS,
      },
      actor,
    ),
  ]);
  if (detail.isErr()) return failed(messageForError(detail.error, DETAIL_READ_ERROR_MESSAGES));
  if (media.isErr()) return failed(messageForError(media.error, MEDIA_LIST_ERROR_MESSAGES));

  const d = detail.value;
  return {
    ok: true,
    value: {
      detail: {
        id: d.id,
        code: d.code,
        propertyType: d.propertyType,
        status: d.status,
        portalTitle: d.portalTitle,
        publishAddress: d.publishAddress,
        description: d.description,
        locationPath: d.locationPath,
        operations: d.operations,
        characteristics: d.characteristics,
        producer: d.producer,
        development: d.development,
      },
      // Las que todavía se procesan o fallaron no tienen versión web para mostrar.
      photoIds: media.value.items
        .filter((item) => item.processing === 'ready')
        .map((item) => item.id),
      totalPhotos: media.value.total,
    },
  };
}

type ActionResultFailure = Extract<ActionResult, { readonly ok: false }>;

/** Una falla con mensaje, para las acciones que además devuelven un valor. */
function failed(message: string): ActionResultFailure {
  return { ok: false, message };
}

// --- Selectores ---

/** Selector de ubicación del alta: barrios, localidades y provincias del catálogo. */
export async function loadLocationOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().properties.searchLocations.execute(
    { page, pageSize: PICKER_PAGE_SIZE, ...(search.trim() === '' ? {} : { q: search }) },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the locations: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map(locationOption),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}

/**
 * Selector de propiedad (filtros de otros módulos, como la bandeja de consultas): una página de la
 * cartera que coincide por código, título o dirección.
 */
export async function loadPropertyOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().properties.listPanelProperties.execute(
    { page, pageSize: PICKER_PAGE_SIZE, ...(search.trim() === '' ? {} : { q: search }) },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the properties: ${result.error.type}`);
  const { items, total } = result.value;
  return {
    options: items.map((property) => ({
      value: property.id,
      label: `${property.code} · ${property.portalTitle}`,
      ...(property.publishAddress === undefined ? {} : { hint: property.publishAddress }),
    })),
    hasMore: page * PICKER_PAGE_SIZE < total,
  };
}

/** Selector de etiquetas de la edición rápida. */
export async function loadTagOptions(search: string, page: number): Promise<ComboboxPage> {
  const { actor } = await requireSession();
  const result = await getContainer().properties.searchTags.execute(
    { page, pageSize: PICKER_PAGE_SIZE, ...(search.trim() === '' ? {} : { q: search }) },
    actor,
  );
  if (result.isErr()) throw new Error(`Could not load the tags: ${result.error.type}`);
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

// --- Acciones masivas ---

export async function bulkEditPropertiesAction(
  input: BulkEditPropertiesInput,
): Promise<{ readonly ok: true; readonly value: BulkEditResult } | ActionResultFailure> {
  const { actor } = await requireSession();
  const parsed = BulkEditPropertiesInputSchema.safeParse(input);
  if (!parsed.success) return failed(BULK_EDIT_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().properties.bulkEditProperties.execute(parsed.data, actor);
  if (result.isErr()) return failed(messageForError(result.error, BULK_EDIT_ERROR_MESSAGES));
  revalidatePath(PROPERTIES_PATH);
  return { ok: true, value: result.value };
}

/** Pide el PDF de la selección en el formato elegido (#175): lo arma un job y avisa en la barra. */
export async function requestPropertyListDocumentAction(
  input: RequestPropertyListDocumentInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = RequestPropertyListDocumentInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(LIST_DOCUMENT_ERROR_MESSAGES.InvalidInput);
  const result = await getContainer().properties.requestPropertyListDocument.execute(
    parsed.data,
    actor,
  );
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, LIST_DOCUMENT_ERROR_MESSAGES));
  }
  return ACTION_OK;
}

/**
 * Lo que el diálogo de PDF necesita de "Ficha y PDF". Sin permiso para exportar no pregunta: el
 * caso de uso que pide el PDF es el que decide.
 */
export async function loadPdfExportOptionsAction(): Promise<PdfExportOptions> {
  const { actor } = await requireSession();
  const result = await getContainer().properties.getPdfExportOptions.execute({}, actor);
  return result.isOk()
    ? result.value
    : { askAgent: false, brandColor: SHOWCASE_OPTION_DEFAULTS.primaryColor };
}

/** Marca o desmarca propiedades como favoritas de quien lo pide. */
export async function setPropertyFavoritesAction(input: {
  readonly ids: readonly string[];
  readonly favorite: boolean;
}): Promise<ActionResult & { readonly changed?: number }> {
  const { actor } = await requireSession();
  const parsed = FavoritesInputSchema.safeParse({ entityType: 'property', ids: input.ids });
  if (!parsed.success) return actionFailed(FAVORITE_ERROR_MESSAGES.InvalidInput);

  const { identity } = getContainer();
  const useCase = input.favorite ? identity.addFavorites : identity.removeFavorites;
  const result = await useCase.execute(parsed.data, actor);
  if (result.isErr()) return actionFailed(messageForError(result.error, FAVORITE_ERROR_MESSAGES));
  revalidatePath(PROPERTIES_PATH);
  return { ...ACTION_OK, changed: result.value.changed };
}

// --- Búsquedas favoritas ---

export async function saveFavoriteSearchAction(
  input: SaveFavoriteSearchInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = SaveFavoriteSearchInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(FAVORITE_SEARCH_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().properties.saveFavoriteSearch.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, FAVORITE_SEARCH_ERROR_MESSAGES));
  }
  revalidatePath(PROPERTIES_PATH);
  return ACTION_OK;
}

export async function deleteFavoriteSearchAction(
  input: FavoriteSearchIdInput,
): Promise<ActionResult> {
  const { actor } = await requireSession();
  const parsed = FavoriteSearchIdInputSchema.safeParse(input);
  if (!parsed.success) return actionFailed(FAVORITE_SEARCH_ERROR_MESSAGES.InvalidInput);

  const result = await getContainer().properties.deleteFavoriteSearch.execute(parsed.data, actor);
  if (result.isErr()) {
    return actionFailed(messageForError(result.error, FAVORITE_SEARCH_ERROR_MESSAGES));
  }
  revalidatePath(PROPERTIES_PATH);
  return ACTION_OK;
}
